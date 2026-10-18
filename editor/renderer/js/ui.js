// ================================================================
//  UI 부품 — 입력칸을 store 의 리소스(키 + 경로)에 바로 연결합니다.
//    F.text('char:mireille', ['name'], { label: '이름' })
//  값이 바뀌면 store.edit(...) 로 기록되어 실행 취소가 됩니다.
// ================================================================
PDM.ui = (function () {
  const { h } = PDM;

  function commit(key, path, value, label, rerender) {
    PDM.store.edit(key, label || ('변경: ' + path.join('.')), r => PDM.deepSet(r, path, value), { silent: !rerender });
  }
  const get = (key, path) => PDM.deepGet(PDM.store.get(key), path);

  function field(label, input, hint) {
    return h('label', { class: 'field' }, label ? h('span', { class: 'fl' }, label) : null, input, hint ? h('small', { class: 'hint' }, hint) : null);
  }
  function row(...kids) { return h('div', { class: 'row' }, ...kids); }
  /** 접은 섹션 기억 (탭 + 제목) — 다시 그려도 접힌 채로 (펼쳐지며 아래가 밀리던 것) */
  const closedSecs = new Set();
  function section(title, ...kids) {
    const id = ((PDM.tabs && PDM.tabs.active) || '') + '|' + (typeof title === 'string' ? title : (title && title.textContent) || '');
    const body = h('div', { class: 'sec-body' }, ...kids);
    const head = h('div', { class: 'sec-head', onclick: () => { const c = el.classList.toggle('closed'); if (c) closedSecs.add(id); else closedSecs.delete(id); } }, h('span', { class: 'caret' }, '▾'), title);
    const el = h('section', { class: 'sec' + (closedSecs.has(id) ? ' closed' : '') }, head, body);
    return el;
  }

  // ---------------- 기본 입력칸 ----------------
  const F = {};
  F.text = (key, path, o = {}) => {
    const i = h('input', { type: 'text', value: get(key, path) ?? '', placeholder: o.placeholder || '' });
    if (o.list) i.setAttribute('list', o.list);
    i.addEventListener('change', () => { let v = i.value; if (o.transform) { v = o.transform(v); i.value = v; } commit(key, path, v, o.label, o.rerender); o.onchange && o.onchange(v); });
    return o.label ? field(o.label, i, o.hint) : i;
  };
  /** 색: 색 고르기 + #rrggbb 입력 */
  F.color = (key, path, o = {}) => {
    const cur = get(key, path) ?? o.def ?? '';
    const norm = v => /^#[0-9a-f]{6}$/i.test(v) ? v : /^#[0-9a-f]{3}$/i.test(v) ? '#' + v.slice(1).split('').map(c => c + c).join('') : '#000000';
    const pick = h('input', { type: 'color', value: norm(cur), class: 'swatch' });
    const txt = h('input', { type: 'text', value: cur, class: 'mono', placeholder: '#rrggbb', style: { width: '84px' } });
    const set = v => { commit(key, path, v, o.label, o.rerender); o.onchange && o.onchange(v); };
    pick.addEventListener('input', () => { txt.value = pick.value; });
    pick.addEventListener('change', () => set(pick.value));
    txt.addEventListener('change', () => { const v = txt.value.trim(); pick.value = norm(v); set(v); });
    const wrap = h('div', { class: 'colorpick' }, pick, txt);
    return o.label ? field(o.label, wrap, o.hint) : wrap;
  };
  F.textarea = (key, path, o = {}) => {
    const i = h('textarea', { rows: o.rows || 3, placeholder: o.placeholder || '' });
    i.value = get(key, path) ?? '';
    i.addEventListener('change', () => { commit(key, path, i.value, o.label, o.rerender); o.onchange && o.onchange(i.value); });
    return o.label ? field(o.label, i, o.hint) : i;
  };
  F.num = (key, path, o = {}) => {
    const i = h('input', { type: 'number', value: get(key, path) ?? (o.def ?? 0), step: o.step || 'any' });
    if (o.min !== undefined) i.min = o.min; if (o.max !== undefined) i.max = o.max;
    i.addEventListener('change', () => {
      let v = parseFloat(i.value); if (isNaN(v)) v = o.def ?? 0;
      if (o.min !== undefined) v = Math.max(o.min, v); if (o.max !== undefined) v = Math.min(o.max, v);
      if (o.int) v = Math.round(v);
      if (o.dec !== undefined) v = +v.toFixed(o.dec);
      i.value = v; commit(key, path, v, o.label, o.rerender); o.onchange && o.onchange(v);
    });
    return o.label ? field(o.label, i, o.hint) : i;
  };
  F.bool = (key, path, o = {}) => {
    const i = h('input', { type: 'checkbox', checked: !!(get(key, path) ?? o.def) });
    i.addEventListener('change', () => { commit(key, path, i.checked, o.label, o.rerender !== false); o.onchange && o.onchange(i.checked); });
    return h('label', { class: 'check' }, i, h('span', {}, o.label || ''));
  };
  /** options: {값: 표시} 또는 [[값, 표시]] */
  F.select = (key, path, options, o = {}) => {
    const entries = Array.isArray(options) ? options : Object.entries(options);
    const cur = get(key, path);
    const s = h('select', {}, o.empty !== undefined ? h('option', { value: '' }, o.empty) : null,
      entries.map(([v, t]) => h('option', { value: v }, t)));
    s.value = cur ?? (o.empty !== undefined ? '' : (entries[0] || [''])[0]);
    if (cur && ![...s.options].some(op => op.value === String(cur))) { s.append(h('option', { value: cur }, `⚠ ${cur} (없음)`)); s.value = cur; }
    s.addEventListener('change', () => {
      let v = s.value; if (o.number) v = +v;
      commit(key, path, v, o.label, o.rerender !== false); o.onchange && o.onchange(v);
    });
    return o.label ? field(o.label, s, o.hint) : s;
  };
  /** 조건식 입력 + 문법 검사 */
  F.cond = (key, path, o = {}) => {
    const i = h('input', { type: 'text', class: 'mono', value: get(key, path) ?? '', placeholder: o.placeholder || '비우면 항상 (예: favor>=200 && switch.met_aria)' });
    const msg = h('small', { class: 'hint' });
    const check = () => { const e = PDM.Cond.check(i.value); msg.textContent = e ? '⚠ ' + e : (o.hint || ''); msg.classList.toggle('bad', !!e); };
    i.addEventListener('input', check);
    i.addEventListener('change', () => { commit(key, path, i.value.trim(), o.label || '조건', o.rerender); o.onchange && o.onchange(i.value); });
    check();
    const wrap = h('label', { class: 'field' }, o.label ? h('span', { class: 'fl' }, o.label) : null, i, msg);
    return wrap;
  };
  /** 쉼표로 구분한 목록 → 배열 */
  F.list = (key, path, o = {}) => {
    const i = h('input', { type: 'text', value: (get(key, path) || []).join(', '), placeholder: o.placeholder || '쉼표로 구분' });
    i.addEventListener('change', () => { let v = i.value.split(',').map(s => s.trim()).filter(Boolean); if (o.number) v = v.map(Number).filter(x => !isNaN(x)); commit(key, path, v, o.label, o.rerender); });
    return o.label ? field(o.label, i, o.hint) : i;
  };
  /** 여러 개 켜고 끄는 칩 */
  F.chips = (key, path, options, o = {}) => {
    const wrap = h('div', { class: 'chips' });
    const cur = new Set(get(key, path) || []);
    (Array.isArray(options) ? options : Object.entries(options)).forEach(([v, t, tip]) => {
      const b = h('button', { class: 'chip' + (cur.has(v) ? ' on' : ''), title: tip || '', onclick: e => {
        e.preventDefault();
        const now = new Set(get(key, path) || []);
        now.has(v) ? now.delete(v) : now.add(v);
        commit(key, path, [...now], o.label, false);
        b.classList.toggle('on');
      } }, t);
      wrap.append(b);
    });
    return o.label ? field(o.label, wrap, o.hint) : wrap;
  };

  // ---------------- 참조 선택 ----------------
  function refOptions(kind, ctx) {
    const s = PDM.store;
    switch (kind) {
      case 'char': return s.all('char').map(c => [c.id, `${c.name} (${c.id})`]);
      case 'charHero': return [['$hero', '플레이어(영웅)'], ...s.all('char').map(c => [c.id, `${c.name} (${c.id})`])];
      case 'item': return s.all('item').map(c => [c.id, `${c.name} (${c.id})`]);
      case 'event': return s.all('event').map(c => [c.id, `${c.name} (${c.id})`]);
      case 'effect': return ((s.get('effects') || {}).list || []).map(c => [c.id, `${c.name || c.id} (${c.id})`]);
      case 'trailer': return ((s.get('trailers') || {}).list || []).map(c => [c.id, `${c.name || c.id} (${c.id})`]);
      case 'quest': return ((s.get('quests') || {}).list || []).map(c => [c.id, `${c.name || c.id} (${c.id})`]);
      case 'badge': return ((s.get('badges') || {}).list || []).map(c => [c.id, `${c.name || c.id} (${c.id})`]);
      case 'combo': return ((s.get('tilecombos') || {}).list || []).map(c => [c.id, `${c.name || c.id} (${c.id})`]);
      case 'filter': return ((s.get('filters') || {}).list || []).map(c => [c.id, `${c.name || c.id} (${c.id})`]);
      case 'textfx': return ((s.get('textfx') || {}).list || []).map(c => [c.id, `${c.name || c.id} (${c.id})` + (c.sheet ? '' : ' — 아직 안 만듦')]);
      case 'prop': return s.all('prop').map(c => [c.id, `${c.name} (${c.id})`]);
      case 'room': {   // 프로젝트 방 템플릿 + 게임 기본 방 ("game:<분류>.<클래스>", 추가할 수 있는 것만)
        const cn = Object.fromEntries(PDM.SPD_ROOM_CATS || []);
        return [...s.all('room').map(c => [c.id, `★ ${c.name} (${c.id}${c.kind === 'special' ? ', 특수' : ''})`]),
          ...(PDM.SPD_ROOMS || []).filter(r => !r.noUse).map(r => ['game:' + r.id, `${cn[r.cat] || r.cat} · ${r.name} (${r.cls})`])];
      }
      case 'node': return PDM.World.options();
      case 'group': return ((s.get('world') || {}).groups || []).map(g => [g.id, g.name]);
      case 'switch': return ((s.get('story') || {}).switches || []).map(v => [v.id, `${v.name || v.id} (${v.id})`]);
      case 'var': return ((s.get('story') || {}).variables || []).map(v => [v.id, `${v.name || v.id} (${v.id})`]);
      case 'route': return ((s.get('story') || {}).routes || []).map(v => [v.id, v.name || v.id]);
      case 'ending': return ((s.get('story') || {}).endings || []).map(v => [v.id, v.name || v.id]);
      case 'heartAction': return ((s.get('heart') || {}).actions || []).map(a => [a.key, a.name]);
      case 'heartRequest': return ((s.get('heart') || {}).requests || []).map(a => [a.key, a.name]);
      case 'topic': return ((s.get('heart') || {}).topics || []).map(a => [a.key, a.name]);
      case 'trait': return ((s.get('heart') || {}).traits || []).map(a => [a.key, a.name]);
      case 'heartStat': return [
        ...['rel.favor', 'rel.trust', 'rel.anger', 'rel.mood', 'rel.temper', 'rel.displeased', 'rel.stress', 'rel.jealousy'].map(k => [k, PDM.T(k)]),
        ...((s.get('heart') || {}).gauges || []).map(g => [g.key, PDM.T(g.key) + ' (게이지)']),
        ...((s.get('heart') || {}).abilities || []).map(a => [a.key, PDM.T(a.key) + ' (능력)']),
        ...((s.get('heart') || {}).marks || []).map(m => [m.key, PDM.T(m.key)]),
        ...((s.get('heart') || {}).crystals || []).map(g => [g, PDM.T(g) + ' (결정)'])];
      case 'terrain': return PDM.TERRAIN.map(t => [t.id, `${t.name} (${t.key})`]);
      case 'theme': return [...Object.entries(PDM.THEMES).map(([k, t]) => [k, t.name]), ...(((s.get('world') || {}).customThemes) || []).map(c => ['custom:' + c.id, c.name + ' (사용자)'])];
      case 'face': {
        const c = ctx && ctx.char && s.get('char:' + ctx.char);
        const ex = (c && c.portrait && c.portrait.expressions) || [];
        return [['', '기본'], ...(Array.isArray(ex) ? ex.map(e => [e.key, e.key]) : Object.keys(ex).map(k => [k, k]))];
      }
    }
    return [];
  }
  F.ref = (key, path, kind, o = {}) => F.select(key, path, refOptions(kind, o.ctx), Object.assign({ empty: o.empty ?? '(선택 안 함)', number: kind === 'terrain' }, o));

  /** 이미지 고르기: 파일을 골라 프로젝트 assets/<sub> 로 복사하고 상대 경로를 저장 */
  async function pickImage(sub) {
    const src = await pdm.openFile('이미지 선택', ['png', 'jpg', 'jpeg', 'gif', 'webp']);
    if (!src) return null;
    const root = PDM.store.root;
    const rel = pdm.relative(root, src).replace(/\\/g, '/');
    if (!rel.startsWith('..') && !/^[A-Za-z]:/.test(rel)) return rel;   // 이미 프로젝트 안
    const name = pdm.basename(src);
    const destRel = `assets/${sub || 'images'}/${name}`;
    await pdm.copy(src, pdm.join(root, destRel));
    return destRel;
  }
  F.image = (key, path, o = {}) => {
    const cur = get(key, path) || '';
    const cv = h('canvas', { class: 'thumb', width: 48, height: 48 });
    const txt = h('input', { type: 'text', value: cur, placeholder: o.placeholder || 'assets/... 또는 game:sprites/...' });
    const draw = async () => {
      const g = cv.getContext('2d'); g.clearRect(0, 0, 48, 48); g.imageSmoothingEnabled = false;
      const img = await PDM.assets.load(txt.value); if (!img) return;
      const sc = Math.min(48 / img.width, 48 / img.height); const w = img.width * sc, hh = img.height * sc;
      g.drawImage(img, (48 - w) / 2, (48 - hh) / 2, w, hh);
    };
    txt.addEventListener('change', () => { commit(key, path, txt.value.trim(), o.label, o.rerender); draw(); o.onchange && o.onchange(txt.value); });
    const btn = h('button', { class: 'btn sm', onclick: async e => {
      e.preventDefault();
      const p = await pickImage(o.sub); if (!p) return;
      txt.value = p; commit(key, path, p, o.label, o.rerender); PDM.assets.invalidate(p); draw(); o.onchange && o.onchange(p);
    } }, '찾기…');
    draw();
    const wrap = h('div', { class: 'imgpick' }, cv, txt, btn);
    return o.label ? field(o.label, wrap, o.hint) : wrap;
  };

  /** 소리 고르기: 프로젝트 사운드(sound:id) · 게임 음악/효과음 · ▶ 미리 듣기. o.kind = 'bgm' | 'se', o.allowNone = '음악 끄기' */
  function soundPicker(cur, set, o = {}) {
    const snd = (((PDM.store.get('sounds') || {}).sounds) || []);
    const mine = snd.filter(s => !o.kind || (s.kind || 'se') === o.kind);
    const other = snd.filter(s => o.kind && (s.kind || 'se') !== o.kind);
    const isM2 = g => (PDM.MOD2_SOUNDS || []).some(n => g === n || g.endsWith('/' + n + '.ogg') || g.endsWith('/' + n + '.mp3')) || /\/title\.mp3$/.test(g);
    const game = (o.kind === 'se' ? PDM.GAME_SOUNDS : o.kind === 'bgm' ? PDM.GAME_MUSIC : [...PDM.GAME_MUSIC, ...PDM.GAME_SOUNDS]).filter(g => PDM.isMod2() || !isM2(g));   // mod-2 전용 소리는 그 저장소일 때만
    const s = h('select', {},
      h('option', { value: '' }, o.empty || '(없음)'),
      o.allowNone ? h('option', { value: 'none' }, o.noneLabel || '(음악 끄기)') : null,
      mine.length ? h('optgroup', { label: '프로젝트 사운드' }, mine.map(x => h('option', { value: 'sound:' + x.id }, `♪ ${x.name || x.id}`))) : null,
      other.length ? h('optgroup', { label: '프로젝트 사운드 (다른 종류)' }, other.map(x => h('option', { value: 'sound:' + x.id }, `${x.name || x.id}`))) : null,
      h('optgroup', { label: o.kind === 'se' ? '게임 효과음' : '게임 음악' }, game.map(g => h('option', { value: g }, g.replace(/^game:(music|sounds)\//, '') + (isM2(g) ? '  (mod-2)' : '')))));
    s.append(h('option', { value: '__path' }, '✎ 파일 경로 직접 입력…'));
    s.value = cur || '';
    const isPath = v => v && v !== 'none' && !v.startsWith('sound:') && !v.startsWith('game:');
    if (cur && s.value !== cur) { s.append(h('option', { value: cur }, isPath(cur) ? `📄 ${cur}` : `⚠ ${cur}`)); s.value = cur; }
    s.addEventListener('change', async () => {
      if (s.value !== '__path') { set(s.value); return; }
      s.value = cur || '';
      const v = (await PDM.ui.prompt('소리 파일 경로', isPath(cur) ? cur : 'assets/audio/', '프로젝트 폴더 기준 경로 (예: assets/audio/door.ogg) 또는 game:sounds/… · game:music/… — ogg · mp3 · wav') || '').trim().replace(/\\/g, '/');
      if (v) set(v);
    });
    // 다른 파일 고르기: 프로젝트 밖의 파일이면 assets/audio 로 복사하고 그 경로를 씀 (이미지 "찾기…" 와 같음)
    const browse = h('button', { class: 'ib', title: '다른 소리 파일 고르기 (ogg · mp3 · wav) — 프로젝트 밖의 파일은 assets/audio 로 복사합니다', onclick: async e => {
      e.preventDefault();
      const src = await pdm.openFile('소리 파일 (ogg · mp3 · wav)', ['ogg', 'mp3', 'wav']); if (!src) return;
      const name = pdm.basename(src), ext = (name.split('.').pop() || '').toLowerCase();
      if (!['ogg', 'mp3', 'wav'].includes(ext)) { toast('ogg, mp3, wav 만 게임에서 재생됩니다', 'bad'); return; }
      const root = PDM.store.root;
      let rel = pdm.relative(root, src).replace(/\\/g, '/');
      if (rel.startsWith('..') || /^[A-Za-z]:/.test(rel)) { rel = `assets/audio/${name}`; try { await pdm.copy(src, pdm.join(root, rel)); } catch (err) { toast('복사 실패: ' + err.message, 'bad'); return; } }
      set(rel);
    } }, '📂');
    const play = h('button', { class: 'ib', title: '미리 듣기', onclick: e => { e.preventDefault(); const v = s.value || o.fallback; if (v && v !== 'none') PDM.audio.play(v); } }, '▶');
    const stop = h('button', { class: 'ib', title: '멈춤', onclick: e => { e.preventDefault(); PDM.audio.stop(); } }, '■');
    const edit = h('button', { class: 'ib', title: '사운드 편집기에서 편집 (프로젝트 소리면 그 소리를, 게임 소리면 복사해서 고칠 수 있게)', onclick: async e => {
      e.preventDefault();
      const v = s.value;
      if (v.startsWith('sound:')) { PDM.sounds.select(v.slice(6)); return; }
      if (v.startsWith('game:') && PDM.sounds.copyGameRef) { const r = await PDM.sounds.copyGameRef(v); if (r) set(r); return; }
      PDM.sounds.select(null);
    } }, '🎚');
    return h('div', { class: 'sndpick' }, s, play, stop, browse, edit);   // 멈춤은 작은 칸(목록)에도
  }
  /** 시스템별 소리: 비우면 기본 소리(sfxKey 의 기본값) · "(소리 없음)" 가능 */
  F.sysSound = (key, path, sfxKey, o = {}) => {
    const def = (PDM.SFX || []).find(x => x[0] === sfxKey);
    const first = def ? (def[2] || '').split('|')[0] : '';
    return F.sound(key, path, Object.assign({ kind: 'se', allowNone: true, noneLabel: '(소리 없음)', fallback: first,
      empty: `(기본: ${first ? first.replace(/^game:sounds\//, '') : '없음'})` }, o));
  };
  F.sound = (key, path, o = {}) => {
    const el = soundPicker(get(key, path), v => commit(key, path, v, o.label || '소리', o.rerender), o);
    return o.label ? field(o.label, el, o.hint) : el;
  };

  /** 게임 아이콘 시트(16×16 칸)에서 번호 고르기: talent_icons.png · hero_icons.png · items.png 등 */
  PDM.ICON_SHEETS = {
    talent: { ref: 'game:interfaces/talent_icons.png', size: 16, name: '특성 아이콘' },
    hero: { ref: 'game:interfaces/hero_icons.png', size: 16, name: '능력 아이콘' },
    item: { ref: 'builtin:items', size: 16, name: '아이템 그림' },
    buff: { ref: 'game:interfaces/buffs.png', size: 7, name: '버프 아이콘' }
  };
  /** 시트의 칸 크기·한 줄 번호 수 — mod-2 는 talent_icons·items 가 2배(32px) 크기 */
  function geom(sheet, img) {
    const S = PDM.ICON_SHEETS[sheet];
    if (sheet === 'item') { const G = PDM.assets.itemGrid(img); return { cell: G.cell, stride: G.stride }; }
    if (sheet === 'talent') { const cell = Math.max(16, Math.round(img.height / 8)); return { cell, stride: Math.floor(img.width / cell) }; }
    return { cell: S.size, stride: Math.floor(img.width / S.size) };
  }
  function drawIcon(cv, sheet, idx, scale) {
    const S = PDM.ICON_SHEETS[sheet]; const g = cv.getContext('2d');
    cv.width = cv.height = S.size * scale; g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height);
    // 직접 지정한 아이콘 파일: "assets/..png"(한 장) 또는 { file, size, index }(시트의 칸)
    if (idx && typeof idx === 'object' || typeof idx === 'string') {
      const file = typeof idx === 'string' ? idx : idx.file;
      PDM.assets.load(file).then(img => {
        if (!img) return;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (typeof idx === 'object') { const cs = Math.max(1, idx.size || 16), cc = Math.max(1, Math.floor(img.width / cs)), i = Math.max(0, idx.index | 0); sx = (i % cc) * cs; sy = Math.floor(i / cc) * cs; sw = sh = cs; }
        const k = Math.min(cv.width / sw, cv.height / sh), dw = sw * k, dh = sh * k;
        g.drawImage(img, sx, sy, sw, sh, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
      });
      return cv;
    }
    PDM.assets.load(S.ref).then(img => {
      if (!img || idx == null || idx < 0) return;
      const G = geom(sheet, img);
      g.drawImage(img, (idx % G.stride) * G.cell, Math.floor(idx / G.stride) * G.cell, G.cell, G.cell, 0, 0, S.size * scale, S.size * scale);
    });
    return cv;
  }
  /** 아이콘 파일 지정: PNG 를 골라(프로젝트 assets/icons 로 복사) 한 장 그대로 / 시트면 칸 크기를 정하고 칸을 클릭 */
  async function pickIconFile(cur) {
    let file = cur && typeof cur === 'object' ? cur.file : typeof cur === 'string' ? cur : null;
    if (!file) { file = await pickImage('icons'); if (!file) return null; }
    let img = await PDM.assets.load(file);
    if (!img) { toast('그림을 불러오지 못했습니다: ' + file, 'bad'); return null; }
    let size = cur && typeof cur === 'object' ? cur.size || 16 : Math.min(img.width, img.height) <= 32 && img.width === img.height ? img.width : 16;
    let chosen = cur && typeof cur === 'object' ? cur.index | 0 : -1, whole = !(cur && typeof cur === 'object') && img.width === img.height && img.width <= 64;
    const cv = h('canvas', { style: { imageRendering: 'pixelated', cursor: 'pointer', background: 'var(--stage)' } });
    const info = h('div', { class: 'hint' });
    const sizeIn = h('input', { type: 'number', min: 4, max: 256, value: size, style: { width: '70px' } });
    const wholeIn = h('input', { type: 'checkbox', checked: whole });
    const fileLbl = h('span', { class: 'mono' }, file);
    const draw = () => {
      const k = Math.max(1, Math.floor(320 / Math.max(img.width, img.height)) || 1);
      cv.width = img.width * k; cv.height = img.height * k;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, cv.width, cv.height);
      if (!whole) {
        g.strokeStyle = 'rgba(165,139,255,.45)';
        for (let x = 0; x <= img.width; x += size) { g.beginPath(); g.moveTo(x * k + .5, 0); g.lineTo(x * k + .5, cv.height); g.stroke(); }
        for (let y = 0; y <= img.height; y += size) { g.beginPath(); g.moveTo(0, y * k + .5); g.lineTo(cv.width, y * k + .5); g.stroke(); }
        const cc = Math.max(1, Math.floor(img.width / size));
        if (chosen >= 0) { g.strokeStyle = '#ffde59'; g.lineWidth = 2; g.strokeRect((chosen % cc) * size * k + 1, Math.floor(chosen / cc) * size * k + 1, size * k - 2, size * k - 2); g.lineWidth = 1; }
        cv.onclick = e => { const b = cv.getBoundingClientRect(), r = cv.width / b.width; chosen = Math.floor((e.clientY - b.top) * r / (size * k)) * cc + Math.floor((e.clientX - b.left) * r / (size * k)); draw(); };
      } else cv.onclick = null;
      info.textContent = whole ? `그림 전체 (${img.width}×${img.height})를 아이콘 한 칸(16×16)에 맞춰 씁니다` : chosen >= 0 ? `칸 ${chosen} (칸 크기 ${size}px) — 게임에서 16×16 에 맞춰 씁니다` : '시트의 칸을 클릭해서 고르세요';
    };
    sizeIn.addEventListener('change', () => { size = Math.max(4, sizeIn.value | 0); draw(); });
    wholeIn.addEventListener('change', () => { whole = wholeIn.checked; draw(); });
    const other = h('button', { class: 'btn sm', onclick: async e => { e.preventDefault(); const f = await pickImage('icons'); if (!f) return; const i2 = await PDM.assets.load(f); if (!i2) return; file = f; img = i2; fileLbl.textContent = f; chosen = -1; draw(); } }, '다른 파일…');
    draw();
    return modal('아이콘 파일 지정', h('div', {},
      h('div', { class: 'hstack gap-4 wrap mb-3' }, '파일', fileLbl, other),
      h('div', { class: 'hstack gap-6 wrap mb-3' },
        h('label', { class: 'check' }, wholeIn, h('span', {}, '그림 전체를 한 아이콘으로')), '시트 칸 크기(px)', sizeIn),
      h('div', { class: 'sheet-view', style: { maxHeight: '55vh' } }, cv), info),
      [['취소', null], ['고르기', () => whole ? file : (chosen >= 0 ? { file, size, index: chosen } : null), 'pri']]);
  }
  async function pickIcon(sheet, cur) {
    const S = PDM.ICON_SHEETS[sheet], D = S.size * 2;
    const cv = h('canvas', { style: { imageRendering: 'pixelated', cursor: 'pointer', background: 'var(--stage)' } });
    const info = h('div', { class: 'hint' }, '번호: ' + (cur ?? '-'));
    let chosen = cur;
    const img = await PDM.assets.load(S.ref);
    if (!img) { toast('게임 그림을 찾지 못했습니다 (프로젝트 설정의 게임 경로 확인)', 'bad'); return null; }
    const G = geom(sheet, img), k = D / G.cell;
    const draw = () => {
      cv.width = img.width * k; cv.height = img.height * k;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, cv.width, cv.height);
      if (chosen != null && chosen >= 0) { g.strokeStyle = '#ffde59'; g.lineWidth = 2; g.strokeRect((chosen % G.stride) * D + 1, Math.floor(chosen / G.stride) * D + 1, D - 2, D - 2); }
    };
    draw();
    cv.onclick = e => { const b = cv.getBoundingClientRect(), r = cv.width / b.width; chosen = Math.floor((e.clientY - b.top) * r / D) * G.stride + Math.floor((e.clientX - b.left) * r / D); info.textContent = '번호: ' + chosen; draw(); };
    return modal(S.name + ' 고르기', h('div', {}, h('div', { class: 'sheet-view', style: { maxHeight: '60vh' } }, cv), info), [['취소', null], ['고르기', () => chosen, 'pri']]);
  }
  F.icon = (key, path, sheet, o = {}) => {
    const cur = get(key, path);
    const custom = cur != null && typeof cur !== 'number';
    const cv = drawIcon(h('canvas', { style: { imageRendering: 'pixelated', verticalAlign: 'middle', background: 'var(--stage)', borderRadius: '3px' } }), sheet, cur ?? o.def, 2);
    const btn = h('button', { class: 'btn sm', title: '게임 아이콘 시트에서 고르기', onclick: async e => { e.preventDefault(); const v = await pickIcon(sheet, custom ? o.def : cur ?? o.def); if (v != null) commit(key, path, v, o.label || '아이콘', true); } }, '게임 아이콘…');
    // 파일 지정·그리기: 능력 아이콘(hero_icons) · 특성 아이콘(talent_icons) · 아이템
    const fileBtn = sheet === 'hero' || sheet === 'talent' ? h('button', { class: 'btn sm', title: '영웅 시트처럼 아이콘 그림 파일을 직접 지정 (한 장 또는 시트의 칸)', onclick: async e => { e.preventDefault(); const v = await pickIconFile(custom ? cur : null); if (v != null) commit(key, path, v, o.label || '아이콘 파일', true); } }, '파일 지정…')
      : sheet === 'item' ? h('button', { class: 'btn sm', title: 'PNG 그림 파일을 직접 지정 (프로젝트 assets/items 로 복사 — 게임에서 아이템 칸 크기에 맞춰 씀)', onclick: async e => { e.preventDefault(); const v = await pickImage('items'); if (v) { PDM.assets.invalidate(v); commit(key, path, v, o.label || '그림 파일', true); } } }, '파일 지정…') : null;
    const drawBtn = sheet === 'hero' || sheet === 'talent' || sheet === 'item' ? h('button', { class: 'btn sm', title: '16×16 아이콘 직접 그리기 (작업 영역 크기는 편집기에서 바꿀 수 있음)', onclick: async e => {
      e.preventDefault();
      let rel = typeof cur === 'string' ? cur : null;
      if (!rel) { rel = `assets/${sheet === 'item' ? 'items' : 'icons'}/${PDM.slugId(String(path[path.length - 2] ?? 'icon'))}_${Date.now().toString(36).slice(-4)}.png`; }
      const out = await PDM.editPixelsModal('아이콘 그리기', rel, 16, 16);
      if (out) { PDM.assets.invalidate(out); commit(key, path, out, o.label || '아이콘 그림', true); }
    } }, typeof cur === 'string' ? '그림 편집…' : '그리기…') : null;
    const el = h('div', { class: 'hstack wrap' }, cv, btn, fileBtn, drawBtn,
      custom ? h('span', { class: 'hint mono', title: JSON.stringify(cur) }, typeof cur === 'string' ? cur.split('/').pop() : `${String(cur.file).split('/').pop()} #${cur.index}`) : cur == null && o.def != null ? h('span', { class: 'hint' }, '(기본)') : null);
    return o.label ? field(o.label, el, o.hint) : el;
  };
  PDM.drawIcon = drawIcon;



  // ---------------- 검색되는 목록 칸 (datalist 대신 — 스크롤바 · 휠 · 분류 · 그림) ----------------
  /** combo(input, getOptions) — getOptions() → [{ value, label, group, sprite }] 또는 [[value, label, group]]
   *  입력하면 걸러지고, ↑↓ Enter · 휠 · 스크롤바로 고름. 고르면 input.value 를 바꾸고 change 를 보냄 */
  function combo(input, getOptions, o = {}) {
    let box = null, items = [], sel = -1;
    const norm = x => Array.isArray(x) ? { value: x[0], label: x[1], group: x[2] } : x;
    const close = () => { if (box) { box.remove(); box = null; } };
    const pick = it => { input.value = it.value; close(); input.dispatchEvent(new Event('change', { bubbles: true })); };
    function open(all) {
      const q = all ? '' : input.value.trim().toLowerCase();
      const list = getOptions().map(norm).filter(x => !q || String(x.value).toLowerCase().includes(q) || String(x.label || '').toLowerCase().includes(q) || String(x.group || '').toLowerCase().includes(q));
      if (!box) {
        box = h('div', { class: 'combo-box' });
        document.body.append(box);
        box.addEventListener('mousedown', e => e.preventDefault());   // 입력 칸 포커스 유지
      }
      const r = input.getBoundingClientRect();
      const below = innerHeight - r.bottom, hgt = Math.min(340, Math.max(160, below - 12));
      Object.assign(box.style, { left: r.left + 'px', width: Math.max(r.width, o.minWidth || 280) + 'px',
        top: (below > 180 ? r.bottom + 2 : Math.max(8, r.top - hgt - 2)) + 'px', maxHeight: hgt + 'px' });
      box.innerHTML = ''; items = []; sel = -1;
      let lastG = null;
      list.slice(0, o.limit || 2000).forEach(it => {
        if (it.group && it.group !== lastG) { lastG = it.group; box.append(h('div', { class: 'combo-g' }, it.group)); }
        const row = h('div', { class: 'combo-i' + (String(it.value) === input.value ? ' on' : ''), title: String(it.value), onclick: () => pick(it) },
          it.sprite ? (() => { const cv = h('canvas', { width: 16, height: 16, class: 'combo-ic' }); PDM.assets.drawItemSprite(cv, it.sprite, 1); return cv; })() : null,
          h('span', { class: 'combo-l' }, it.label || String(it.value)), h('span', { class: 'combo-v' }, String(it.value)));
        items.push([row, it]); box.append(row);
      });
      if (!list.length) box.append(h('div', { class: 'combo-g' }, '맞는 항목이 없습니다 (그대로 입력해도 됩니다)'));
      else if (list.length > (o.limit || 2000)) box.append(h('div', { class: 'combo-g' }, `… ${list.length - (o.limit || 2000)}개 더 — 글자를 입력해 좁히세요`));
      const on = items.findIndex(([, it]) => String(it.value) === input.value);
      if (on >= 0) { sel = on; items[on][0].scrollIntoView({ block: 'center' }); }
    }
    const mark = () => items.forEach(([el], i) => el.classList.toggle('hl', i === sel));
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('focus', () => open(true));
    input.addEventListener('click', () => { if (!box) open(true); });
    input.addEventListener('input', () => open(false));
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('keydown', e => {
      if (!box) { if (e.key === 'ArrowDown') { open(true); e.preventDefault(); } return; }
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); items[sel] && items[sel][0].scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); items[sel] && items[sel][0].scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
      else if (e.key === 'Enter') { if (items[sel]) { pick(items[sel][1]); e.preventDefault(); } else close(); }
      else if (e.key === 'Escape') close();
    });
    const btn = h('button', { class: 'ib combo-btn', title: '목록 열기', tabindex: -1, onclick: e => { e.preventDefault(); if (box) close(); else { input.focus(); open(true); } } }, '▾');
    return h('div', { class: 'combo' }, input, btn);
  }
  /** 아이템 고르기 칸 (프로젝트 아이템 + 게임 아이템) */
  function itemOptions() {
    // 리소스 목록(아이템)과 같은 순서: 분류(project.itemCatOrder) → 세부 종류(project.itemSubOrder) → 그 안에서 프로젝트 아이템(project.itemOrder, 없으면 티어·이름) 다음 게임 아이템
    const s = PDM.store, proj = s.get('project') || {};
    const all = s.all('item'), ord = proj.itemOrder || [], catOrd = proj.itemCatOrder || [];
    const tierOf = it => (it.kind === 'melee' || it.kind === 'missile' ? (it.weapon || {}).tier : it.kind === 'armor' ? (it.armor || {}).tier : it.kind === 'codex' ? (it.codex || {}).tier : it.tier) || 0;
    const subOf = i => i.subtype !== undefined && i.subtype !== null ? i.subtype : i.kind === 'melee' ? 'melee' : i.kind === 'missile' ? 'missile' : i.kind === 'armor' ? 'armor' : i.kind === 'codex' ? ((i.codex || {}).type || 'melee') : '';
    const sortItems = l => l.slice().sort((x, y) => tierOf(x) - tierOf(y) || String(x.name).localeCompare(String(y.name))).map((x, i) => [x, ord.indexOf(x.id) < 0 ? 100000 + i : ord.indexOf(x.id)]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
    const G = PDM.SPD_ITEM_GROUPS || {};
    const cats = Object.keys(PDM.ITEM_CATEGORY_INFO).map((k, i) => [k, catOrd.indexOf(k) < 0 ? 1000 + i : catOrd.indexOf(k)]).sort((x, y) => x[1] - y[1]).map(x => x[0]);
    const out = [];
    const mineOpt = (i, group) => ({ value: i.id, label: '★ ' + (i.name || i.id) + (tierOf(i) ? ' · ' + tierOf(i) + '티어' : ''), group, sprite: i.sprite });
    const gameOpt = (x, group) => ({ value: 'spd:' + x.p, label: x.n + (x.t ? ' · ' + x.t + '티어' : '') + (x.mod2 ? ' ◆' : ''), group, sprite: { sheet: 'builtin:items', name: x.img } });
    cats.forEach(cat => {
      const name = (PDM.ITEM_CATEGORY_INFO[cat] || {}).name || cat;
      const mine = all.filter(i => (i.category || 'misc') === cat), game = (G[cat] || []).filter(x => !x.mod2 || PDM.isMod2());
      if (!mine.length && !game.length) return;
      const subs = PDM.itemSubs(cat);
      if (subs) {
        const known = Object.keys(subs);
        known.forEach(sk => {
          const g = name + ' · ' + subs[sk];
          sortItems(mine.filter(i => subOf(i) === sk)).forEach(i => out.push(mineOpt(i, g)));
          game.filter(x => (x.sub || '') === sk).forEach(x => out.push(gameOpt(x, g)));
        });
        sortItems(mine.filter(i => !known.includes(subOf(i)))).forEach(i => out.push(mineOpt(i, name)));
        game.filter(x => !known.includes(x.sub || '')).forEach(x => out.push(gameOpt(x, name)));
      } else {
        sortItems(mine).forEach(i => out.push(mineOpt(i, name)));
        game.forEach(x => out.push(gameOpt(x, name)));
      }
    });
    // 분류가 목록에 없는 프로젝트 아이템 (예전 데이터)
    all.filter(i => !out.some(o => o.value === i.id)).forEach(i => out.push(mineOpt(i, '프로젝트 아이템')));
    return out;
  }
  // ---------------- 숫자 칸: 마우스를 올리고 휠로 올리고 내리기 ----------------
  //  (포커스가 없어도 됨) step 만큼, Shift = ×10. min·max 를 지키고, 휠을 멈추면 한 번만 저장(change)
  (function wheelNumbers() {
    const pending = new Map();
    document.addEventListener('wheel', e => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== 'number' || t.disabled || t.readOnly || e.ctrlKey) return;
      e.preventDefault();
      const st = parseFloat(t.step); const step = (isFinite(st) && st > 0 ? st : 1) * (e.shiftKey ? 10 : 1);
      let v = parseFloat(t.value); if (!isFinite(v)) v = 0;
      v += e.deltaY < 0 ? step : -step;
      const mn = parseFloat(t.min), mx = parseFloat(t.max);
      if (isFinite(mn)) v = Math.max(mn, v); if (isFinite(mx)) v = Math.min(mx, v);
      const dec = (String(step).split('.')[1] || '').length;
      t.value = dec ? v.toFixed(dec) : String(Math.round(v));
      t.dispatchEvent(new Event('input', { bubbles: true }));
      clearTimeout(pending.get(t));
      pending.set(t, setTimeout(() => { pending.delete(t); if (t.isConnected) t.dispatchEvent(new Event('change', { bubbles: true })); }, 350));
    }, { passive: false });
  })();
  // ---------------- 목록 편집 ----------------
  /** 배열 편집기: 추가/삭제/위아래 이동. render(item, index, itemPath) 는 DOM 을 돌려줌 */
  function listEditor(key, path, o) {
    const wrap = h('div', { class: 'listed' });
    const arr = get(key, path) || [];
    arr.forEach((it, i) => {
      const ipath = [...path, i];
      const tools = h('div', { class: 'li-tools' },
        h('button', { class: 'ib', title: '위로', disabled: i === 0, onclick: e => { e.preventDefault(); PDM.store.edit(key, '순서 바꾸기', r => { const a = PDM.deepGet(r, path); [a[i - 1], a[i]] = [a[i], a[i - 1]]; }); } }, '↑'),
        h('button', { class: 'ib', title: '아래로', disabled: i === arr.length - 1, onclick: e => { e.preventDefault(); PDM.store.edit(key, '순서 바꾸기', r => { const a = PDM.deepGet(r, path); [a[i + 1], a[i]] = [a[i], a[i + 1]]; }); } }, '↓'),
        o.dup !== false ? h('button', { class: 'ib', title: '복제', onclick: e => { e.preventDefault(); PDM.store.edit(key, '복제', r => { const a = PDM.deepGet(r, path); a.splice(i + 1, 0, PDM.clone(a[i])); }); } }, '⧉') : null,
        h('button', { class: 'ib danger', title: '삭제', onclick: e => { e.preventDefault(); PDM.store.edit(key, '삭제', r => { PDM.deepGet(r, path).splice(i, 1); }); } }, '✕'));
      wrap.append(h('div', { class: 'li' + (o.compact ? ' compact' : '') }, h('div', { class: 'li-body' }, o.render(it, i, ipath)), tools));
    });
    if (!arr.length && o.emptyText) wrap.append(h('div', { class: 'empty' }, o.emptyText));
    wrap.append(h('button', { class: 'btn sm add', onclick: e => {
      e.preventDefault();
      PDM.store.edit(key, o.addLabel || '추가', r => { if (!PDM.deepGet(r, path)) PDM.deepSet(r, path, []); PDM.deepGet(r, path).push(o.make()); });
    } }, '+ ' + (o.addLabel || '추가')));
    return wrap;
  }


  // ---------------- Java 코드 칸 ----------------
  /** 자주 쓰는 코드 조각 (코드 칸의 "조각 넣기" 메뉴) */
  const SNIPPETS = [
    ['확률', 'if (Random.Int(4) == 0) {\n    \n}'],
    ['효과(버프) 걸기', 'Buff.affect(enemy, Burning.class).reignite(enemy);'],
    ['시간제 효과', 'Buff.affect(enemy, Paralysis.class, 2f);'],
    ['몇 턴 지속 효과 (영웅)', 'Buff.prolong(hero, Haste.class, 5f);'],
    ['체력 회복', 'hero.HP = Math.min(hero.HT, hero.HP + 3);\nhero.sprite.showStatus(CharSprite.POSITIVE, "+3");'],
    ['피해 주기', 'enemy.damage(Random.NormalIntRange(2, 5), hero);'],
    ['주변 적 모두', 'for (Mob m : Dungeon.level.mobs.toArray(new Mob[0])) {\n    if (m.alignment == Char.Alignment.ENEMY && Dungeon.level.distance(hero.pos, m.pos) <= 2) {\n        \n    }\n}'],
    ['메시지', 'GLog.i("메시지");        // GLog.p 긍정 · GLog.w 경고 · GLog.n 부정'],
    ['효과음', 'Sample.INSTANCE.play(Assets.Sounds.HIT);'],
    ['아이템 주기', 'MakerItem.give(hero, "item_id");        // 프로젝트 아이템 id 또는 게임 아이템 이름 (예: "Cudgel", "PotionOfHealing") · 개수: give(hero, "id", 3)'],
    ['아이템 만들기 (직접 다루기)', 'Item it = MakerItem.create("item_id");   // 또는 new Cudgel() · new I_내아이템id()\nif (it != null && !it.collect()) Dungeon.level.drop(it, hero.pos).sprite.drop();'],
    ['스위치/변수 (이벤트와 공유)', 'if (StoryState.sw("my_switch")) { StoryState.setVar("my_var", StoryState.var("my_var") + 1); }'],
    ['이벤트 실행', 'EventInterpreter.runEvent("event_id", null);']
  ];
  function insertAt(ta, text) {
    const a = ta.selectionStart, b = ta.selectionEnd;
    ta.setRangeText(text, a, b, 'end'); ta.dispatchEvent(new Event('input'));
  }
  /** 코드 칸: 고정폭, Tab = 공백 4, 줄 번호, 괄호 검사, 조각 넣기. o.sig = 메서드 머리 (보여 주기용) */
  F.code = (key, path, o = {}) => {
    const ta = h('textarea', { class: 'code', spellcheck: false, placeholder: o.placeholder || '// 여기에 Java 코드' });
    ta.value = get(key, path) ?? '';
    const nums = h('div', { class: 'code-ln' });
    const msg = h('div', { class: 'code-msg' });
    const fit = () => {
      const n = Math.max(o.rows || 3, ta.value.split('\n').length + 1);
      ta.rows = Math.min(n, 40);
      nums.textContent = Array.from({ length: ta.value.split('\n').length }, (_, i) => i + 1).join('\n');
      const errs = PDM.codegen ? PDM.codegen.lint(ta.value) : [];
      msg.textContent = errs.map(e => `${e.line}번째 줄: ${e.msg}`).join(' · ');
      msg.style.display = errs.length ? '' : 'none';
    };
    ta.addEventListener('input', fit);
    ta.addEventListener('scroll', () => { nums.scrollTop = ta.scrollTop; });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); insertAt(ta, '    '); }
      else if (e.key === 'Enter') { // 자동 들여쓰기
        const before = ta.value.slice(0, ta.selectionStart); const cur = before.slice(before.lastIndexOf('\n') + 1);
        let pad = cur.match(/^\s*/)[0]; if (/[{(]\s*$/.test(cur)) pad += '    ';
        e.preventDefault(); insertAt(ta, '\n' + pad);
      } else if (e.key === '}') { // 빈 줄에서 } 를 치면 들여쓰기 한 단계 빼기
        const a = ta.selectionStart, ls = ta.value.lastIndexOf('\n', a - 1) + 1, cur = ta.value.slice(ls, a);
        if (/^ {4,}$/.test(cur) && a === ta.selectionEnd) { e.preventDefault(); ta.setRangeText(cur.slice(4) + '}', ls, a, 'end'); ta.dispatchEvent(new Event('input')); }
      }
    });
    ta.addEventListener('change', () => { commit(key, path, ta.value, o.label || '코드', o.rerender); o.onchange && o.onchange(ta.value); });
    fit();
    const snip = h('button', { class: 'btn xs', onclick: e => {
      e.preventDefault(); const b = e.target.getBoundingClientRect();
      menu(b.left, b.bottom, SNIPPETS.map(([t, c]) => ({ label: t, run: () => { ta.focus(); insertAt(ta, c); ta.dispatchEvent(new Event('change')); } })));
    } }, '조각 넣기 ▾');
    const head = h('div', { class: 'code-head' },
      o.sig ? h('span', { class: 'mono code-sig' }, o.sig) : h('span', {}, o.label || ''),
      h('span', { class: 'grow' }), snip);
    return h('div', { class: 'code-field' + (ta.value.trim() ? ' used' : '') }, head, o.doc ? h('small', { class: 'hint' }, o.doc) : null,
      h('div', { class: 'code-wrap' }, nums, ta), msg, o.sig ? h('div', { class: 'mono code-sig end' }, '}') : null);
  };
  /** 생성될 Java 파일 보기 */
  function codeView(title, src) {
    const lines = String(src).split('\n');
    const pre = h('pre', { class: 'code-view' }, lines.map((l, i) => h('div', { class: /▼ \[/.test(l) ? 'mark' : '' }, h('i', {}, String(i + 1)), l || ' ')));
    return modal(title, h('div', {}, h('p', { class: 'hint' }, '▶ 테스트 플레이 / 런타임 설치 때 게임 저장소의 pdmaker/gen 폴더에 이 파일이 만들어집니다. 컴파일 오류가 나면 로그에 "에디터 코드 오류: … 몇째 줄" 이 함께 나옵니다.'), pre),
      [['복사', () => { navigator.clipboard && navigator.clipboard.writeText(src); return null; }], ['닫기', null, 'pri']]);
  }

  // ---------------- 대화상자 / 메뉴 ----------------
  const openModals = [];   // 떠 있는 창 (Ctrl+W · Esc 로 맨 위 것을 닫음)
  /** 맨 위의 메뉴 또는 창을 닫음. 닫은 것이 있으면 true */
  function closeTop() {
    const m = $$('.ctx'); if (m.length) { m.forEach(x => x.remove()); return true; }
    const t = openModals[openModals.length - 1]; if (t) { t(null); return true; }
    return false;
  }
  function modal(title, body, buttons) {
    return new Promise(res => {
      const close = v => { const i = openModals.indexOf(close); if (i >= 0) openModals.splice(i, 1); bg.remove(); res(v); };
      openModals.push(close);
      const foot = h('div', { class: 'modal-foot' }, (buttons || [['확인', true]]).map(([t, v, cls]) => h('button', { class: 'btn ' + (cls || ''), onclick: () => close(typeof v === 'function' ? v() : v) }, t)));
      const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : '' }, h('div', { class: 'modal-head' }, title, h('button', { class: 'ib', title: '닫기 (Esc)', 'aria-label': '닫기', onclick: () => close(null) }, '✕')), h('div', { class: 'modal-body' }, body), foot);
      const bg = h('div', { class: 'modal-bg', onmousedown: e => { if (e.target === bg) close(null); } }, box);
      document.body.append(bg);
      const first = box.querySelector('input,textarea,select'); if (first) setTimeout(() => first.focus(), 30);
    });
  }
  async function prompt(title, def, hint) {
    const i = h('input', { type: 'text', value: def || '' });
    i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('.modal-foot .pri').click(); } });
    const r = await modal(title, h('div', {}, i, hint ? h('small', { class: 'hint' }, hint) : null), [['취소', null], ['확인', () => i.value, 'pri']]);
    return r;
  }
  /** 확인 창 — 모든 편집기가 같은 모양 · 같은 버튼 순서(취소 · 확인)를 씀.
   *  o: { title, ok(확인 버튼 글), danger } — danger = 지우기 같은 되돌리기 어려운 일: 빨간 버튼 + ⚠.
   *  o 를 주지 않으면 글에 "삭제 · 지우 · 버리 · 덮어"가 있을 때 danger 로 봄 (예전: 지우기 확인도 일반 확인과 모양이 같았음) */
  async function confirm(msg, o = {}) {
    const danger = o.danger !== undefined ? !!o.danger : /삭제|지우|지울|버리|버릴|덮어/.test(String(msg));
    const body = h('p', { class: danger ? 'confirm-danger' : '' }, danger ? h('span', { class: 'confirm-ico', 'aria-hidden': 'true' }, '⚠') : null, msg);
    return !!(await modal(o.title || (danger ? '확인 — 되돌리기 어려운 작업' : '확인'), body, [['취소', false], [o.ok || (danger ? '진행' : '확인'), true, danger ? 'danger solid' : 'pri']]));
  }
  function menu(x, y, items) {
    $$('.ctx').forEach(m => m.remove());
    const m = h('div', { class: 'ctx', style: { left: x + 'px', top: y + 'px' } },
      items.filter(Boolean).map(it => it === '-' ? h('hr') : it.head ? h('div', { class: 'ctx-h' }, it.head)
        : h('div', { class: 'ctx-i' + (it.disabled ? ' dis' : '') + (it.checked !== undefined ? ' chk' : '') + (it.danger || /^삭제/.test(it.label || '') ? ' danger' : ''), role: 'menuitem', onclick: () => { m.remove(); !it.disabled && it.run(); } },
          it.checked !== undefined ? h('span', { class: 'ctx-ck' }, it.checked ? '✓' : '') : null, it.label, it.hint ? h('small', {}, it.hint) : null)));
    document.body.append(m);
    const r = m.getBoundingClientRect();
    if (r.right > innerWidth) m.style.left = (innerWidth - r.width - 4) + 'px';
    if (r.bottom > innerHeight) m.style.top = Math.max(4, innerHeight - r.height - 4) + 'px';   // 긴 메뉴는 위에서부터 (넘치면 메뉴 안에서 스크롤)
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); } }), 0);
  }

  /** 새 맵·방을 만들 때 "몬스터 스폰" 여부 묻기 → true(생김) · false(안 생김) · null(취소) */
  PDM.askSpawn = function (title) {
    let v = true;
    const opt = (val, t, d) => { const r = h('input', { type: 'radio', name: 'pdmSpawn', checked: val === v, onchange: () => { v = val; } }); return h('label', { style: { display: 'block', margin: '6px 0', cursor: 'pointer' } }, r, ' ', h('b', {}, t), h('div', { class: 'hint', style: { marginLeft: '22px' } }, d)); };
    return modal(title || '몬스터 스폰', h('div', { style: { minWidth: '340px' } }, opt(true, '몬스터가 생김', '층을 만들 때 몬스터가 놓이고, 시간이 지나면 다시 생깁니다'), opt(false, '몬스터가 생기지 않음', '안전한 곳 — 직접 놓은 몬스터·NPC 만 나옵니다. 나중에 속성에서 바꿀 수 있습니다')),
      [['취소', null], ['만들기', () => v, 'pri']]);
  };
  /** 묶음 버튼: 누르면 아래로 메뉴 (자주 안 쓰는 버튼 · 보기 켜고 끄기를 한데 모아 화면을 단순하게).
   *  items() = 메뉴 항목 배열(누를 때 계산) — { label, run, hint, disabled, checked(켜고 끄기면 true/false) } · '-' · { head } */
  function dropBtn(label, items, o = {}) {
    const b = h('button', { class: (o.cls || 'btn sm') + ' drop', title: o.title || '', disabled: !!o.disabled, onclick: e => {
      e.preventDefault(); e.stopPropagation(); const r = b.getBoundingClientRect(); menu(r.left, r.bottom + 2, typeof items === 'function' ? items() : items);
    } }, label, h('span', { class: 'drop-caret' }, '▾'));
    return b;
  }
  return { F, field, row, section, listEditor, dropBtn, combo, itemOptions, modal, prompt, confirm, menu, closeTop, get modalOpen() { return openModals.length > 0; }, pickImage, refOptions, commit, codeView, SNIPPETS, soundPicker };
})();
