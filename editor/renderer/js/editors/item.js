// ================================================================
//  아이템 편집기 — 추가/수정, 스프라이트(게임 items.png 에서 고르기 또는 직접 그리기)
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const CAT_ICON = Object.fromEntries(Object.entries(PDM.ITEM_CATEGORY_INFO).map(([k, v]) => [k, v.icon]));
  /** 티어가 저장되는 곳: 무기·갑옷·코덱스는 수치의 tier, 그 밖은 아이템의 tier */
  const tierPath = it => it.kind === 'melee' || it.kind === 'missile' ? ['weapon', 'tier'] : it.kind === 'armor' ? ['armor', 'tier'] : it.kind === 'codex' ? ['codex', 'tier'] : ['tier'];
  const tierOf = it => PDM.deepGet(it, tierPath(it)) || 0;
  /** 세부 종류 관리: 더하기 · 이름 바꾸기 · 지우기(직접 더한 것) / 숨기기(기본) — project.itemSubs */
  async function manageSubs(cat) {
    const info = PDM.ITEM_CATEGORY_INFO[cat] || {};
    const base = info.subs || {};
    const draw = () => {
      const subs = PDM.itemSubs(cat) || {};
      const custom = ((store.get('project').itemSubs || {})[cat]) || {};
      const used = k => store.all('item').filter(i => i.category === cat && (i.subtype || '') === k).length;
      const set = (k, v, label) => store.edit('project', label, p => { p.itemSubs = p.itemSubs || {}; p.itemSubs[cat] = p.itemSubs[cat] || {}; if (v === undefined) delete p.itemSubs[cat][k]; else p.itemSubs[cat][k] = v; });
      const rows = Object.entries(subs).map(([k, v]) => h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', margin: '3px 0' } },
        h('code', { style: { minWidth: '90px' } }, k || '(일반)'), h('b', { style: { flex: 1 } }, v), h('span', { class: 'hint' }, `아이템 ${used(k)}개`),
        h('button', { class: 'btn xs', onclick: async () => { const n = await PDM.ui.prompt('세부 종류 이름', v); if (n != null && n.trim()) { set(k, n.trim(), '세부 종류 이름'); box.replaceChildren(draw()); } } }, '이름'),
        base[k] !== undefined && custom[k] !== undefined ? h('button', { class: 'btn xs', title: '기본 이름으로', onclick: () => { set(k, undefined, '세부 종류 기본으로'); box.replaceChildren(draw()); } }, '기본') : null,
        h('button', { class: 'btn xs danger', onclick: async () => {
          if (used(k) && !(await PDM.ui.confirm(`이 세부 종류의 아이템 ${used(k)}개는 분류 바로 아래에 보이게 됩니다. 지울까요?`))) return;
          set(k, base[k] !== undefined ? null : undefined, '세부 종류 지우기'); box.replaceChildren(draw());
        } }, base[k] !== undefined ? '숨기기' : '지우기')));
      const hidden = Object.keys(base).filter(k => custom[k] === null).map(k => h('button', { class: 'btn xs', onclick: () => { set(k, undefined, '세부 종류 다시 보이기'); box.replaceChildren(draw()); } }, '다시 보이기: ' + base[k]));
      return h('div', {}, rows.length ? rows : h('p', { class: 'hint' }, '세부 종류가 없습니다'), hidden.length ? h('div', { style: { marginTop: '6px' } }, ...hidden) : null,
        h('button', { class: 'btn sm', style: { marginTop: '8px' }, onclick: async () => {
          const n = await PDM.ui.prompt('새 세부 종류 이름', '', '예: 단검, 대검, 활 — 키(영문)는 이름에서 자동으로 만듦'); if (!n || !n.trim()) return;
          let k = PDM.slugId(n, ''); if (!k || /^\d/.test(k)) k = 'sub_' + Date.now().toString(36).slice(-4);
          const exist = PDM.itemSubs(cat) || {}; while (exist[k] !== undefined) k += '_2';
          set(k, n.trim(), '세부 종류 추가'); box.replaceChildren(draw());
        } }, '+ 세부 종류'));
    };
    const box = h('div', {}, draw());
    await PDM.ui.modal(`세부 종류 — ${info.name || cat}`, h('div', { style: { minWidth: '420px' } }, h('p', { class: 'hint' }, '아이템 목록(리소스)과 아이템의 "세부 종류" 선택에 쓰입니다. 기본 세부 종류는 이름만 바꾸거나 숨길 수 있습니다. 프로젝트 설정(project.json)에 저장됩니다.'), box), [['닫기', null, 'pri']]);
  }
  /** 분류 · 세부 종류 · 사용 방식 + 게임의 같은 분류 아이템 (참고) */
  function categoryBlock(key, it) {
    const { F, row, field } = PDM.ui;
    const info = PDM.ITEM_CATEGORY_INFO[it.category] || PDM.ITEM_CATEGORY_INFO.misc;
    const subs = PDM.itemSubs(it.category);
    const game = (PDM.SPD_ITEM_GROUPS[it.category] || []).filter(x => !subs || !it.subtype || x.sub === it.subtype);
    const cons = it.consumable ?? !!info.consumable;
    return h('div', {},
      row(F.select(key, ['category'], PDM.itemCategories(), { label: '분류 (게임 items 폴더 기준)', rerender: true, onchange: () => store.edit(key, '세부 종류 맞춤', o => { const s2 = PDM.itemSubs(o.category); o.subtype = s2 ? Object.keys(s2)[0] : ''; }) }),
        h('div', {}, subs ? F.select(key, ['subtype'], subs, { label: '세부 종류', rerender: true }) : h('div', { class: 'hint', style: { marginTop: '18px' } }, '세부 종류 없음'),
          h('button', { class: 'btn xs', style: { marginTop: '4px' }, onclick: e => { e.preventDefault(); manageSubs(it.category); } }, '세부 종류 관리…')),
        F.num(key, tierPath(it), { label: '티어', int: true, min: 0, max: 9, def: 0, rerender: true, hint: tierPath(it).length > 1 ? '무기·갑옷 수치의 티어 (아래 "종류와 수치"와 같은 값)' : '0 = 없음 · 목록에서 정렬·표시' }),
        F.num(key, ['price'], { label: '가격', int: true, min: 0 })),
      (it.kind || 'misc') === 'misc' ? row(F.bool(key, ['consumable'], { label: '사용하면 1개 사라짐', def: !!info.consumable, rerender: true }),
        F.text(key, ['useLabel'], { label: '사용 버튼 이름', placeholder: info.use || '사용' }),
        it.category === 'food' ? F.num(key, ['stats', 'energy'], { label: '포만감 (300 = 식량 한 끼)', int: true, min: 0, def: 300 }) : null) : null,
      h('p', { class: 'hint' }, `게임 폴더: items/${info.dir || ''}${info.note ? ' · ' + info.note : ''}${cons && (it.kind || 'misc') === 'misc' ? ' · 사용하면 사라짐' : ''}`),
      game.length ? h('details', {}, h('summary', { style: { cursor: 'pointer' }, class: 'hint' }, `게임의 같은 분류 아이템 ${game.length}개 (시작 아이템·상점 등에 spd:이름 으로 씀)`),
        h('div', { class: 'spd-list' }, game.map(x => h('code', { title: 'spd:' + x.p, class: x.mod2 ? 'mod2' : '' }, x.p.split('.').pop())))) : null);
  }

  /** 아이템 소리 (프로젝트 아이템: sound · throwSound · pickupSound · equipSound / 게임 아이템: sounds.json 의 gameItems) */
  const EQUIP_KINDS = ['melee', 'armor', 'ring', 'artifact', 'codex', 'grimoire', 'wand'];
  function itemSoundFields(key, it, game) {
    const { F, row } = PDM.ui;
    const P = game ? f => ['gameItems', key, f] : f => [f === 'use' ? 'sound' : f + 'Sound'];
    const K = game ? 'sounds' : key;
    const o = (label, f, empty, hint) => F.sound(K, P(f), { label, kind: 'se', allowNone: true, noneLabel: '(소리 없음)', empty, hint, rerender: true });
    const kind = game ? '' : (it.kind || 'misc');
    const codex = kind === 'codex' || kind === 'grimoire';
    const fields = [
      codex ? null : o(game ? '사용할 때 (행동 버튼)' : '쓸 때', 'use', game ? '(게임 원래 소리만)' : kind === 'misc' ? '(기본: 분류에 맞는 소리)' : '(없음)', game ? '먹기·마시기·읽기·휘두르기 등 행동 버튼을 누를 때 — 게임 원래 소리에 더해 납니다' : null),
      o('던질 때', 'throw', game ? '(게임 원래 소리만)' : '(게임 원래 소리)'),
      o('주울 때', 'pickup', '(게임 원래 소리)', '고르면 게임의 줍는 소리 대신 이 소리'),
      game || EQUIP_KINDS.includes(kind) ? o('장착 · 해제할 때', 'equip', game ? '(게임 원래 소리만)' : '(게임 원래 소리)') : null].filter(Boolean);
    return [row(...fields.slice(0, 2)), row(...fields.slice(2)),
      codex ? h('p', { class: 'hint' }, '쓸 때·맞을 때·빗나갈 때 소리는 위의 코덱스 설정에 있습니다.') : null,
      h('p', { class: 'hint' }, '🎚 을 누르면 사운드 편집기에서 그 소리를 편집합니다 (게임 소리는 프로젝트로 복사해서 편집). "(소리 없음)"을 고르면 조용해집니다.')];
  }

  /** 세부 종류: subtype, 없으면 종류(kind)로 추측 */
  const subOf = i => i.subtype !== undefined && i.subtype !== null ? i.subtype
    : i.kind === 'melee' ? 'melee' : i.kind === 'missile' ? 'missile' : i.kind === 'armor' ? 'armor' : i.kind === 'codex' ? ((i.codex || {}).type || 'melee') : '';
  async function newItem(cat, sub) {
    // id 입력: 영문 소문자·숫자·밑줄로 바뀌는 것을 바로 보여 줌 (이름도 처음엔 바뀐 id 와 같게)
    const inp = h('input', { type: 'text', placeholder: '예: TestWeapon' });
    const out = h('div', { class: 'mono', style: { margin: '6px 0' } }, 'id · 이름 → ');
    inp.addEventListener('input', () => { out.textContent = 'id · 이름 → ' + (inp.value.trim() ? PDM.slugId(inp.value) : ''); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); PDM.$('.modal-foot .pri').click(); } });
    // 분류 · 세부 종류: 목록(리소스)의 그 자리에 들어감
    const cats = PDM.itemCategories();
    const catSel = h('select', {}, Object.entries(cats).map(([k, v]) => h('option', { value: k }, v)));
    catSel.value = cats[cat] ? cat : 'misc';
    const subSel = h('select', {});
    const fillSubs = keep => {
      const ss = PDM.itemSubs(catSel.value) || {};
      subSel.replaceChildren(...Object.entries(ss).map(([k, v]) => h('option', { value: k }, v)));
      subSel.disabled = !Object.keys(ss).length;
      if (keep !== undefined && ss[keep] !== undefined) subSel.value = keep;
    };
    fillSubs(sub); catSel.addEventListener('change', () => fillSubs());
    const id = await PDM.ui.modal('새 아이템', h('div', {}, h('div', { class: 'fl' }, 'id (영문)'), inp, out,
      h('small', { class: 'hint' }, '대문자는 소문자로, 영문·숫자 말고는 밑줄(_)로 바뀝니다 — 예: TestWeapon → testweapon. 이름도 처음엔 이 id 와 같게 만들고, 만든 뒤 "이름" 칸에서 바꿀 수 있습니다.'),
      h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } },
        h('label', {}, h('div', { class: 'fl' }, '분류'), catSel), h('label', {}, h('div', { class: 'fl' }, '세부 종류'), subSel))),
      [['취소', null], ['만들기', () => inp.value, 'pri']]);
    if (!id || !String(id).trim()) return;
    cat = catSel.value; sub = subSel.disabled ? undefined : subSel.value;
    const clean = PDM.slugId(id);
    if (store.has('item:' + clean)) { toast('같은 id 가 있습니다: ' + clean, 'bad'); return; }
    const it = PDM.make.item(clean); it.name = clean; it.category = cat || 'misc';
    if (sub !== undefined) it.subtype = sub;
    if (cat === 'weapon' && (sub === 'melee' || sub === 'missile' || sub === 'dart')) { it.kind = sub === 'melee' ? 'melee' : 'missile'; it.weapon = PDM.make.weaponStats(it.kind, 1); it.stackable = it.kind === 'missile'; }
    if (cat === 'armor') { it.kind = 'armor'; it.armor = PDM.make.armorStats(1); it.stackable = false; }
    if (cat === 'codex') { it.kind = 'codex'; it.codex = PDM.make.codexStats(sub || 'melee', 1); it.stackable = true; }
    if (cat === 'bag' && sub === 'grimoire') { it.kind = 'grimoire'; it.bag = { capacity: 19, holds: 'codex' }; it.stackable = false; }
    store.add('item:' + clean, it, '아이템 추가'); PDM.tabs.open('item:' + clean);
  }

  /** 게임 아이템을 프로젝트 아이템으로 복사 (이름·설명·그림·분류·티어 수치) */
  async function copyGameItem(g) {
    const cls = g.p.split('.').pop();
    let id = PDM.slugId(cls.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()), k = 2;
    while (store.has('item:' + id)) id = id.replace(/_\d+$/, '') + '_' + (k++);
    const cat = Object.keys(PDM.SPD_ITEM_GROUPS).find(c => PDM.SPD_ITEM_GROUPS[c].includes(g)) || 'misc';
    const it = PDM.make.item(id);
    Object.assign(it, { name: g.n, desc: g.d || '', category: cat, subtype: g.sub || '', sprite: { sheet: 'builtin:items', name: g.img, index: 0 }, note: '게임 아이템 spd:' + g.p + ' 에서 복사' });
    const img = await PDM.assets.load('builtin:items'); it.sprite.index = PDM.assets.itemIndex(it.sprite, img);
    if (cat === 'weapon' && (g.sub === 'melee')) { it.kind = 'melee'; it.weapon = PDM.make.weaponStats('melee', g.t || 1); it.stackable = false; }
    else if (cat === 'weapon' && (g.sub === 'missile' || g.sub === 'dart')) { it.kind = 'missile'; it.weapon = PDM.make.weaponStats('missile', g.t || 1); it.stackable = true; }
    else if (cat === 'armor' && g.sub !== 'class') { it.kind = 'armor'; it.armor = PDM.make.armorStats(g.t || 1); it.stackable = false; }
    else if (cat === 'codex') { it.kind = 'codex'; it.codex = PDM.make.codexStats(g.sub || 'melee', g.t || 1); it.stackable = true; }
    else if (cat === 'bag' && /grimoire/i.test(g.p)) { it.kind = 'grimoire'; it.bag = { capacity: 19, holds: 'codex' }; it.stackable = false; }
    else if (['artifact', 'ring', 'wand', 'bag', 'trinket'].includes(cat)) it.stackable = false;
    if (cat === 'food') it.stats = { energy: 300 };
    store.add('item:' + id, it, '게임 아이템 복사');
    PDM.tabs.open('item:' + id);
  }
  PDM.copyGameItem = copyGameItem;

  /** 게임 아이템을 상속한 프로젝트 아이템 만들기 (kind game) → 코드 칸으로 */
  async function inheritGameItem(g) {
    const cls = g.p.split('.').pop();
    let id = PDM.slugId(cls.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()) + '_mod', k = 2;
    const want = await PDM.ui.prompt('새 아이템 id (영문)', id, `게임 「${g.n}」 을(를) 상속합니다. 이름을 그대로 두거나 설명을 비워 두면 게임 것을 씁니다.`); if (!want) return;
    id = PDM.slugId(want); while (store.has('item:' + id)) id = PDM.slugId(want) + '_' + (k++);
    const cat = Object.keys(PDM.SPD_ITEM_GROUPS).find(c => PDM.SPD_ITEM_GROUPS[c].includes(g)) || 'misc';
    const it = PDM.make.item(id);
    Object.assign(it, { kind: 'game', base: g.p, name: g.n, baseName: g.n, desc: '', category: cat, subtype: g.sub || '', sprite: { sheet: 'builtin:items', name: g.img }, stackable: false, note: '게임 아이템 spd:' + g.p + ' 상속' });
    try { const img = await PDM.assets.load('builtin:items'); it.sprite.index = PDM.assets.itemIndex(it.sprite, img); } catch (_) { /* 이름만 */ }
    store.add('item:' + id, it, '게임 아이템 상속');
    PDM.tabs.open('item:' + id);
  }

  /** items.png 전체를 보여주고 클릭으로 고르기 — 원작(16px)·mod-2(32px) 시트 모두. ItemSpriteSheet 상수 이름도 같이 저장 */
  function sheetPicker(key, it) {
    const cv = h('canvas', { style: { cursor: 'pointer', imageRendering: 'pixelated' } });
    const info = h('div', { class: 'hint' });
    PDM.assets.load(it.sprite.sheet || 'builtin:items').then(img => {
      if (!img) return;
      const G = PDM.assets.itemGrid(img), D = 32, sc = D / G.cell;   // 한 칸을 32px 로 보여줌
      cv.width = img.width * sc; cv.height = img.height * sc;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, cv.width, cv.height);
      const i = PDM.assets.itemIndex(it.sprite, img);
      g.strokeStyle = '#ffde59'; g.lineWidth = 2; g.strokeRect((i % G.stride) * D + 1, Math.floor(i / G.stride) * D + 1, D - 2, D - 2);
      info.textContent = `번호 ${i}${it.sprite.name ? ' · ' + it.sprite.name : ''} · ${G.mod2 ? 'mod-2 시트 (32px)' : '원작 시트 (16px)'}`;
      cv.onclick = e => {
        const b = cv.getBoundingClientRect(), k = cv.width / b.width;
        const col = Math.floor((e.clientX - b.left) * k / D), row = Math.floor((e.clientY - b.top) * k / D);
        const n = row * G.stride + col, nm = PDM.assets.itemSpriteName(n, img);
        store.edit(key, '스프라이트 번호', o => { o.sprite = { sheet: o.sprite.sheet || 'builtin:items', index: n }; if (nm) o.sprite.name = nm; });
      };
    });
    return h('div', {}, info, h('div', { class: 'sheet-view', style: { maxHeight: '320px' } }, cv));
  }

  /** items.png 한 칸 크기 (원작 16 · mod-2 32) */
  async function itemCell() { const img = await PDM.assets.load('builtin:items'); return img ? PDM.assets.itemGrid(img).cell : 16; }
  /** 게임 시트의 한 칸(sprite = {sheet,index,name})을 PNG 파일로 복사 → 프로젝트 경로 rel */
  async function copyCellToPng(sprite, rel) {
    const img = await PDM.assets.load((sprite && sprite.sheet) || 'builtin:items'); if (!img) { toast('게임 그림을 불러오지 못했습니다 (프로젝트 설정의 게임 저장소 확인)', 'bad'); return null; }
    const G = PDM.assets.itemGrid(img), i = PDM.assets.itemIndex(sprite || {}, img);
    const cv = document.createElement('canvas'); cv.width = G.cell; cv.height = G.cell;
    cv.getContext('2d').drawImage(img, (i % G.stride) * G.cell, Math.floor(i / G.stride) * G.cell, G.cell, G.cell, 0, 0, G.cell, G.cell);
    try { await pdm.mkdir(pdm.dirname(store.abs(rel))); } catch (_) { /* 있음 */ }
    await pdm.writeDataURL(store.abs(rel), cv.toDataURL('image/png'));
    PDM.assets.invalidate(rel);
    return rel;
  }
  /** 겹치지 않는 PNG 경로 */
  async function freePng(base) {
    let rel = `assets/sprites/items/${base}.png`, k = 2;
    while (await pdm.exists(store.abs(rel))) rel = `assets/sprites/items/${base}_${k++}.png`;
    return rel;
  }
  /** 그림 편집 도구 줄: 게임 그림 복사해서 고치기 · 직접 그리기/편집 · PNG 파일 고르기 (skey 의 path 에 {png} 로 저장) */
  function spriteTools(skey, path, cur, baseName, gameSprite) {
    const set = (v, label) => store.edit(skey, label, r => { PDM.deepSet(r, path, v); });
    return h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '4px 0 8px' } },
      h('button', { class: 'btn sm', title: '지금 그림(또는 게임 원래 그림)을 PNG 로 복사해서 픽셀 편집기로 엽니다', onclick: async () => {
        const src = cur && !cur.png ? cur : gameSprite;
        const rel = await copyCellToPng(src, await freePng(baseName)); if (!rel) return;
        const out = await PDM.editPixelsModal('아이템 그림 편집 — ' + baseName, rel, 16, 16);
        set({ png: out || rel }, '아이템 그림: 게임 그림 복사해서 고침');
      } }, '게임 그림 복사해서 고치기…'),
      h('button', { class: 'btn sm', onclick: async () => {
        const rel = (cur && cur.png) || await freePng(baseName);
        const sz = await itemCell();
        const out = await PDM.editPixelsModal('아이템 그리기 — ' + baseName, rel, sz, sz);
        if (out) set({ png: out }, '아이템 그림: 직접 그림');
      } }, cur && cur.png ? '그림 편집…' : '직접 그리기…'),
      h('button', { class: 'btn sm', onclick: async () => {
        const f = await pdm.openFile('아이템 그림 PNG 고르기', ['png']); if (!f) return;
        const rel = await freePng(pdm.basename(f, '.png'));
        try { await pdm.mkdir(pdm.dirname(store.abs(rel))); } catch (_) { /* 있음 */ }
        await pdm.copy(f, store.abs(rel)); PDM.assets.invalidate(rel);
        set({ png: rel }, '아이템 그림: PNG 파일');
      } }, 'PNG 파일 고르기…'));
  }

  /** items.png 의 한 칸 고르기 (작은 미리보기 + 시트 창) — 값: { sheet, index, name } */
  function itemSpriteField(key, path, o = {}) {
    const cur = PDM.deepGet(store.get(key), path) || null;
    const cv = h('canvas', { width: 32, height: 32, class: 'thumb', style: { imageRendering: 'pixelated' } });
    if (cur) PDM.assets.drawItemSprite(cv, cur, 2);
    const pick = async e => {
      e.preventDefault();
      const img = await PDM.assets.load('builtin:items'); if (!img) return;
      const G = PDM.assets.itemGrid(img), D = 32, sc = D / G.cell;
      const big = h('canvas', { width: img.width * sc, height: img.height * sc, style: { cursor: 'pointer', imageRendering: 'pixelated' } });
      const g = big.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, big.width, big.height);
      if (cur) { const i = PDM.assets.itemIndex(cur, img); g.strokeStyle = '#ffde59'; g.lineWidth = 2; g.strokeRect((i % G.stride) * D + 1, Math.floor(i / G.stride) * D + 1, D - 2, D - 2); }
      let close = null;
      big.onclick = ev => {
        const b = big.getBoundingClientRect(), k = big.width / b.width;
        const n = Math.floor((ev.clientY - b.top) * k / D) * G.stride + Math.floor((ev.clientX - b.left) * k / D), nm = PDM.assets.itemSpriteName(n, img);
        store.edit(key, o.label || '그림', r => { PDM.deepSet(r, path, Object.assign({ sheet: 'builtin:items', index: n }, nm ? { name: nm } : {})); });
        if (close) close();
      };
      const m = PDM.ui.modal(o.label || '그림 고르기', h('div', { class: 'sheet-view', style: { maxHeight: '70vh' } }, big), [['닫기', null]]);
      close = () => { const bg = big.closest('.modal-bg'); if (bg) bg.remove(); };
      void m;
    };
    const clear = e => { e.preventDefault(); store.edit(key, (o.label || '그림') + ' 지우기', r => { PDM.deepSet(r, path, null); }); };
    const wrap = h('div', { class: 'imgpick' }, cv, h('span', { class: 'hint', style: { minWidth: '90px' } }, cur ? (cur.png ? 'PNG 그림' : cur.name || '#' + cur.index) : '(없음)'),
      h('button', { class: 'btn sm', onclick: pick }, '시트에서 고르기…'), cur ? h('button', { class: 'btn sm', onclick: clear }, '지우기') : null);
    return PDM.ui.field(o.label, wrap, o.hint);
  }

  const HOOK_LABEL = { proc: '적중 시', armorProc: '피격 시', min: '최소 피해', max: '최대 피해', drMin: '최소 방어', drMax: '최대 방어',
    onEquip: '장착', onUnequip: '해제', onPickUp: '주움', desc: '설명 글', members: '추가 멤버', imports: 'import' };

  /** 종류(kind)별 수치 */
  function statsSection(key, it) {
    const { F, row, field } = PDM.ui;
    const kind = it.kind || 'misc';
    const kindSel = h('select', {}, Object.entries(Object.assign({}, PDM.itemKinds(), PDM.ITEM_KINDS[kind] && !PDM.itemKinds()[kind] ? { [kind]: PDM.ITEM_KINDS[kind] } : {})).map(([k, v]) => h('option', { value: k, selected: k === kind }, v)));
    kindSel.addEventListener('change', () => store.edit(key, '아이템 종류', o => {
      o.kind = kindSel.value;
      const tier = (o.stats && o.stats.tier) || 1;
      if ((o.kind === 'melee' || o.kind === 'missile') && !o.weapon) o.weapon = PDM.make.weaponStats(o.kind, tier);
      if (o.kind === 'armor' && !o.armor) o.armor = PDM.make.armorStats(tier);
      if (o.kind === 'codex' && !o.codex) o.codex = PDM.make.codexStats('melee', tier);
      if (o.kind === 'grimoire' && !o.bag) o.bag = { capacity: 19, holds: 'codex' };
      if (o.kind === 'game' && !o.base) o.base = 'Item';
      if (o.kind !== 'misc' && o.kind !== 'game') o.stackable = o.kind === 'missile' || o.kind === 'codex';
      if (o.kind === 'melee' || o.kind === 'missile') o.category = 'weapon'; else if (o.kind === 'armor') o.category = 'armor';
      else if (o.kind === 'codex') o.category = 'codex'; else if (o.kind === 'grimoire') o.category = 'bag';
    }));
    const kindHint = { misc: '일반 아이템: 사용 명령(이벤트)과 코드 행동 버튼으로 동작',
      codex: 'mod-2 코덱스(items/weapon/codices)처럼 겹쳐 쌓이고, "사용"하면 대상을 골라 공격·시전하며, 쓸 때마다 내구가 닳아 다 닳으면 하나가 사라집니다. 강화하면 피해와 사용 횟수(×1.5)가 늘어납니다. 원작·mod-2 모두에서 동작 (PDMaker MakerCodex)',
      grimoire: 'mod-2 그리모어(bags/grimoire)처럼 코덱스를 담는 가방입니다',
      game: '게임의 아이템 클래스를 그대로 상속합니다 (효과·강화·감정 모두 게임 그대로). 이름·설명·그림·가격은 비워 두면 게임 것, 아래 "코드"의 훅·행동 버튼·추가 멤버로 동작을 고치거나 더합니다.' }[kind]
      || `게임의 ${ {melee: 'MeleeWeapon', missile: 'MissileWeapon', armor: 'Armor'}[kind] } 을 상속한 클래스가 만들어집니다 (강화·마법 부여·저주 모두 원래대로)`;
    const out = [field('종류 (게임 안에서의 동작)', kindSel, kindHint)];
    if (kind === 'game') {
      const all = Object.values(PDM.SPD_ITEM_GROUPS || {}).flat();
      const dl = null;
      const g = all.find(x => x.p === it.base);
      out.push(h('div', {}, dl, row((() => { const bi = h('input', { type: 'text', value: it.base || '' });
        bi.addEventListener('change', () => PDM.ui.commit(key, ['base'], bi.value.trim().replace(/^spd:/, '').replace(/^items\./, ''), '바탕 게임 아이템', true));
        return PDM.ui.field('바탕 게임 아이템 (items 폴더 기준 경로)', PDM.ui.combo(bi, () => PDM.ui.itemOptions().filter(x => x.value.startsWith('spd:')).map(x => Object.assign({}, x, { value: x.value.slice(4) }))), g ? `게임 아이템 「${g.n}」` : '예: wands.WandOfFireblast, weapon.melee.Sword, food.Pasty'); })(),
        g ? h('div', { class: 'field' }, h('span', { class: 'fl' }, ' '), h('button', { class: 'btn sm', onclick: () => PDM.tabs.open('spditem:' + g.p) }, '게임 아이템 보기')) : null)));
    }
    const W = p => ['weapon', p], A = p => ['armor', p];
    if (kind === 'melee' || kind === 'missile') {
      out.push(row(F.num(key, W('tier'), { label: '티어', int: true, min: 1, max: 5, hint: '힘 요구치 기본값' }),
        F.num(key, W('min'), { label: '최소 피해', int: true, min: 0 }), F.num(key, W('minPerLvl'), { label: '강화당 최소 +', int: true, min: 0 }),
        F.num(key, W('max'), { label: '최대 피해', int: true, min: 0 }), F.num(key, W('maxPerLvl'), { label: '강화당 최대 +', int: true, min: 0 })));
      out.push(row(F.num(key, W('str'), { label: '필요 힘', int: true, min: 0, hint: '0 = 티어 기본' }),
        F.num(key, W('accuracy'), { label: '명중 배율', min: 0, step: 0.05, def: 1, hint: '1 = 보통' }),
        F.num(key, W('delay'), { label: '공격 시간', min: 0.1, step: 0.1, def: 1, hint: '1 = 보통, 0.5 = 두 번' }),
        kind === 'melee' ? F.num(key, W('reach'), { label: '사거리', int: true, min: 1, max: 4, def: 1 }) : null,
        kind === 'missile' ? F.num(key, W('baseUses'), { label: '내구 (던지는 횟수)', min: 1, def: 8 }) : null,
        kind === 'missile' ? F.bool(key, W('sticky'), { label: '적에게 박힘' }) : null));
      const w = it.weapon || {};
      out.push(h('p', { class: 'hint' }, `+0: ${w.min | 0}~${w.max | 0}  ·  +3: ${(w.min | 0) + 3 * (w.minPerLvl | 0)}~${(w.max | 0) + 3 * (w.maxPerLvl | 0)}  (원본 게임 ${kind === 'melee' ? '근접' : '투척'} 무기 티어 ${w.tier || 1} 기본: ${kind === 'melee' ? `${w.tier || 1}~${5 * ((w.tier || 1) + 1)}` : `${2 * (w.tier || 1)}~${5 * (w.tier || 1)}`})`));
    } else if (kind === 'armor') {
      out.push(row(F.num(key, A('tier'), { label: '티어', int: true, min: 1, max: 5 }),
        F.num(key, A('drMin'), { label: '최소 방어', int: true, min: 0 }), F.num(key, A('drMinPerLvl'), { label: '강화당 최소 +', int: true, min: 0 }),
        F.num(key, A('drMax'), { label: '최대 방어', int: true, min: 0 }), F.num(key, A('drMaxPerLvl'), { label: '강화당 최대 +', int: true, min: 0 }),
        F.num(key, A('str'), { label: '필요 힘', int: true, min: 0, hint: '0 = 티어 기본' })));
    } else if (kind === 'codex') {
      const C = p => ['codex', p], cx = it.codex || {};
      out.push(row(F.select(key, C('type'), PDM.CODEX_TYPES, { label: '코덱스 종류', rerender: true }), F.num(key, C('tier'), { label: '티어', int: true, min: 1, max: 5, rerender: true }),
        F.num(key, C('quantity'), { label: '처음 개수', int: true, min: 1 }), F.num(key, C('baseUses'), { label: '내구 (1개당 사용 횟수)', min: 1, rerender: true, hint: '강화마다 ×1.5, 100 이상이면 닳지 않음' }),
        F.num(key, C('str'), { label: '필요 힘', int: true, min: 0, hint: `0 = 티어 기본 (${7 + 2 * (cx.tier || 1)})` })));
      out.push(row(F.num(key, C('min'), { label: '최소 피해', int: true, min: 0 }), F.num(key, C('minPerLvl'), { label: '강화당 최소 +', int: true, min: 0 }),
        F.num(key, C('max'), { label: '최대 피해 (0 = 피해 없음)', int: true, min: 0 }), F.num(key, C('maxPerLvl'), { label: '강화당 최대 +', int: true, min: 0 }),
        F.num(key, C('castTime'), { label: '걸리는 턴', min: 0, step: 0.5, def: 1 })));
      out.push(row(cx.type === 'cast' ? F.select(key, C('target'), { self: '자신', cell: '칸', enemy: '적 하나' }, { label: '대상' }) : null,
        cx.type !== 'melee' ? F.num(key, C('range'), { label: '사거리', int: true, min: 1 }) : null,
        cx.type === 'cast' ? F.num(key, C('radius'), { label: '피해 반경', int: true, min: 0 }) : null,
        cx.type !== 'melee' ? F.select(key, C('visual'), Object.assign({ item: '마법 그림 (아래에서 고른 그림이 날아감)' }, PDM.SKILL_VISUALS), { label: '날아가는 효과', rerender: true }) : null,
        F.num(key, C('heat'), { label: '게이지(과열) +', int: true, hint: 'mod-2 코덱스는 8' })));
      // 연출: mod-2 RangedCodex.magicImage(날아가는 그림) · MeleeCodex MagicImageAnimator(베기·찌르기) · MagicBullet(연타)
      out.push(row(itemSpriteField(key, C('magicImage'), { label: cx.type === 'melee' ? '베기 그림 (마법 칼날)' : '날아가는 마법 그림', hint: cx.type === 'melee' ? 'mod-2: MAGIC_SLASH 등 — 영웅 옆에서 휘두름 (원작 저장소에는 없음)' : 'mod-2: MAGIC_ARROW·MAGIC_BULLET 등 — "날아가는 효과"가 마법 그림일 때' }),
        cx.type === 'melee' ? F.select(key, C('anim'), { alternate: '베기 → 찌르기 번갈아', sweep: '베기', stab: '찌르기', charge: '차징', smash: '내려치기', none: '없음' }, { label: '베기 동작' }) : null,
        cx.type === 'ranged' ? F.bool(key, C('spin'), { label: '날아가며 빙글빙글' }) : null,
        F.num(key, C('hits'), { label: '연타 (한 번 쓸 때 맞히는 횟수)', int: true, min: 1, max: 10, def: 1 }),
        F.num(key, C('hitDelay'), { label: '연타 간격 (초)', step: 0.05, min: 0.02, def: cx.type === 'ranged' ? 0.05 : 0.1 })));
      out.push(h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '이 코덱스의 소리 (비우면 기본 소리 · 🎚 로 편집)'));
      out.push(row(F.sound(key, C('sound'), { label: '쓸 때', kind: 'se', empty: '(기본 소리)' }),
        F.sound(key, C('hitSound'), { label: '맞을 때', kind: 'se', empty: '(기본 소리)' }),
        cx.type !== 'cast' ? F.sound(key, C('missSound'), { label: '빗나갈 때', kind: 'se', empty: '(기본 소리)' }) : null,
        F.sound(key, C('breakSound'), { label: '다 닳아 없어질 때', kind: 'se', empty: '(기본 소리)' })));
      out.push(h('p', { class: 'hint' }, `근접·원거리는 원작처럼 빗나갈 수 있습니다. 피해 × (1 + 코덱스 피해 %: 게이지 단계·원소·특성·전직). 힘이 모자라면 위력 −33%. +0: ${cx.min | 0}~${cx.max | 0} · +3: ${(cx.min | 0) + 3 * (cx.minPerLvl | 0)}~${(cx.max | 0) + 3 * (cx.maxPerLvl | 0)} · 사용 +0 ${Math.round(cx.baseUses || 10)}회, +3 ${Math.round((cx.baseUses || 10) * 3.375)}회`));
      out.push(h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '추가 효과 (피해 뒤에 차례로 — 상태 효과·밀치기 등)'));
      out.push(PDM.castEffectsEditor ? PDM.castEffectsEditor(key, C('effects'), { emptyText: '추가 효과 없음', make: () => ({ type: 'buff', on: 'target', buff: 'Burning', turns: 3 }) }) : h('span'));
    } else if (kind === 'grimoire') {
      out.push(row(F.num(key, ['bag', 'capacity'], { label: '칸 수', int: true, min: 1, max: 40, def: 19 }),
        F.select(key, ['bag', 'holds'], { codex: '코덱스만', all: '무엇이든' }, { label: '담는 것' })));
    }
    return out;
  }

  /** 코드 훅 + 행동 버튼 */
  function codeSection(key, it, ctx) {
    const { F, row, listEditor } = PDM.ui;
    const cg = PDM.codegen;
    const kind = cg.hookKind(it);
    const st = ctx.state = ctx.state || {};
    const hooks = cg.ITEM_HOOKS.filter(x => x.kinds.includes(kind)).map(x => x.key).concat(['members', 'imports']);
    const cur = hooks.includes(st.hook) ? st.hook : hooks[0];
    const code = it.code || {};
    const used = k => typeof code[k] === 'string' && code[k].trim();
    const tabs = h('div', { class: 'code-tabs' }, hooks.map(k => h('button', { class: 'btn xs' + (k === cur ? ' on' : ''), onclick: e => { e.preventDefault(); st.hook = k; ctx.refresh(); } }, (used(k) ? '● ' : '') + HOOK_LABEL[k])));
    const hk = cg.ITEM_HOOKS.find(x => x.key === cur);
    const body = hk
      ? F.code(key, ['code', cur], { sig: `${hk.ret} ${hk.key}(${hk.params}) {`, doc: hk.doc + (hk.ret !== 'void' ? ` — return 을 안 쓰면 ${hk.val} 를 그대로 돌려줍니다.` : '') + (['proc', 'armorProc'].includes(cur) ? ' (마법 부여·각인 효과는 먼저 적용됨)' : ''), rerender: true })
      : cur === 'members'
        ? F.code(key, ['code', 'members'], { label: '클래스에 추가할 변수·함수', doc: '예: 충전 수, 도우미 함수. storeInBundle/restoreFromBundle 을 직접 재정의하면 저장도 됩니다.', rows: 4, rerender: true })
        : F.code(key, ['code', 'imports'], { label: 'import (한 줄에 하나)', rows: 2, rerender: true });
    const acts = listEditor(key, ['actions'], {
      addLabel: '행동 버튼', emptyText: '아이템을 눌렀을 때 나오는 버튼을 코드로 추가할 수 있습니다 (예: 흔들기, 읽기)',
      make: () => PDM.make.itemAction(),
      render: (a, i, p) => h('div', {},
        row(F.text(key, [...p, 'name'], { label: '버튼 이름' }), F.text(key, [...p, 'id'], { label: 'id', transform: v => PDM.slugId(v) }),
          F.num(key, [...p, 'time'], { label: '걸리는 턴', min: 0, step: 0.5, def: 1 }), F.bool(key, [...p, 'default'], { label: '기본 행동' }), F.bool(key, [...p, 'consume'], { label: '쓰면 사라짐' })),
        F.cond(key, [...p, 'cond'], { label: '버튼이 보이는 조건 (비우면 항상)' }),
        F.code(key, [...p, 'code'], { sig: `case "PDM_${a.id}": {   // Hero hero, 이 아이템 = this`, rows: 3 }))
    });
    return [
      h('p', { class: 'hint' }, `게임 클래스로 만들어집니다: pdmaker/gen/${cg.itemPath(it)} (${it.kind === 'game' ? 'items.' + (it.base || 'Item') : kind === 'misc' ? 'MakerItem' : { melee: 'MeleeWeapon', missile: 'MissileWeapon', armor: 'Armor', codex: 'MakerCodex', grimoire: 'MakerCodex.MakerGrimoire' }[kind]} 상속). 코드 오류는 게임을 멈추지 않고 경고만 뜹니다.${it.kind === 'game' ? ' "추가 멤버"에 @Override 로 게임 함수를 직접 다시 쓸 수 있습니다 (예: public void execute(Hero hero, String action) { … super.execute(hero, action); }).' : ''}`),
      tabs, body,
      h('div', { class: 'fl', style: { margin: '10px 0 2px' } }, '행동 버튼'), acts,
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' } },
        h('button', { class: 'btn sm', onclick: () => PDM.ui.codeView(cg.itemClass(it.id) + '.java', cg.itemSource(store.get(key))) }, '생성될 코드 보기'),
        h('span', { class: 'hint' }, '아이템마다 게임 클래스가 하나씩 만들어집니다 (아이템 도감에도 오름)')),
      PDM.codeApiRef ? PDM.codeApiRef() : null
    ];
  }

  /** 게임 저장소의 자바 파일 (core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/<rel>) */
  async function javaPath(rel) {
    const repo = PDM.app && PDM.app.resolveRepo ? await PDM.app.resolveRepo(true) : '';
    return repo ? pdm.join(repo, 'core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon', ...rel.split('/')) : '';
  }
  /** 코드 파일 보기: 파일이 있으면 그 내용, 없으면 fallback(에디터가 만들 코드). 외부 편집기로 열기 버튼 */
  async function showCodeFile(rel, title, fallback) {
    const f = await javaPath(rel);
    let txt = null;
    try { if (f && await pdm.exists(f)) txt = await pdm.readText(f); } catch (_) { /* 무시 */ }
    if (txt == null && fallback == null) { toast('파일이 없습니다: ' + (f || rel), 'bad'); return; }
    const src = txt != null ? txt : fallback;
    const lines = String(src).split('\n');
    const pre = h('pre', { class: 'code-view' }, lines.map((l, i) => h('div', { class: /▼ \[/.test(l) ? 'mark' : '' }, h('i', {}, String(i + 1)), l || ' ')));
    PDM.ui.modal(title, h('div', {},
      h('p', { class: 'hint mono' }, txt != null ? f : '아직 파일이 없습니다 (▶ 테스트 플레이 때 만들어짐) — 에디터가 만들 코드를 보여 줍니다'),
      txt != null && fallback != null && txt !== fallback ? h('p', { class: 'hint' }, '※ 파일은 마지막 테스트 플레이 때 만든 것입니다. 지금 에디터 내용과 다르면 다음 테스트 플레이 때 바뀝니다.') : null, pre),
      [['복사', () => { navigator.clipboard && navigator.clipboard.writeText(src); return null; }],
        ...(txt != null && pdm.isElectron ? [['파일 위치 열기', () => { pdm.showInFolder(f).catch(e => toast(e.message, 'bad')); return null; }], ['외부 편집기로 열기', () => { pdm.openExternal(f); return null; }]] : []), ['닫기', null, 'pri']]);
  }
  PDM.showCodeFile = showCodeFile;

  PDM.registerEditor({
    id: 'item', icon: k => { const c = store.get(k); return (c && CAT_ICON[c.category]) || '🎁'; },
    match: k => k.startsWith('item:'),
    title: k => { const c = store.get(k); return c ? c.name : k; },
    tree() {
      if (!store.isOpen) return [];
      const all = store.all('item');
      const proj = store.get('project') || {};
      const G = Object.fromEntries(Object.entries(PDM.SPD_ITEM_GROUPS || {}).map(([c, l]) => [c, l.filter(x => !x.mod2 || PDM.isMod2())]));   // mod-2 전용은 그 저장소일 때만
      const total = Object.values(G).reduce((a, l) => a + l.length, 0);
      // ---- 순서: 아이템(project.itemOrder) · 분류(project.itemCatOrder) · 세부 종류(project.itemSubOrder[분류])
      //      끌어 놓기 또는 줄의 ▲▼ 로 옮김. 순서를 정하지 않은 아이템은 티어·이름 순으로 뒤에
      const ord = proj.itemOrder || [];
      const byTier = (a, b) => tierOf(a) - tierOf(b) || String(a.name).localeCompare(String(b.name));
      const sortItems = l => { const t = l.slice().sort(byTier); return t.map((x, i) => [x, ord.indexOf(x.id) < 0 ? 100000 + i : ord.indexOf(x.id)]).sort((a, b) => a[1] - b[1]).map(x => x[0]); };
      const allSorted = () => sortItems(store.all('item')).map(x => x.id);
      /** 아이템을 다른 아이템의 앞/뒤로 (분류·세부 종류도 그 아이템과 같게) */
      const placeItem = (id, targetId, pos) => store.transaction('아이템 옮기기', () => {
        const tg = store.get('item:' + targetId); if (!tg || id === targetId) return;
        store.edit('item:' + id, '아이템 분류', o => { o.category = tg.category || 'misc'; o.subtype = subOf(tg); });
        const ids = allSorted().filter(x => x !== id); const k = ids.indexOf(targetId);
        ids.splice(pos === 'before' ? k : k + 1, 0, id);
        store.edit('project', '아이템 순서', p => { p.itemOrder = ids; });
      });
      /** 아이템을 분류(·세부 종류) 안으로 */
      const intoGroup = (id, cat, sub) => store.transaction('아이템 분류 옮기기', () => {
        store.edit('item:' + id, '아이템 분류', o => { o.category = cat; const ss = PDM.itemSubs(cat); o.subtype = sub !== undefined ? sub : ss ? (ss[subOf(o)] !== undefined ? subOf(o) : Object.keys(ss)[0]) : ''; });
        const ids = allSorted().filter(x => x !== id); ids.push(id);
        store.edit('project', '아이템 순서', p => { p.itemOrder = ids; });
      });
      const swapWith = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; placeItem(list[i].id, list[j].id, d < 0 ? 'before' : 'after'); };
      const moveKey = (path, keys, k, targetK, pos) => store.edit('project', '순서 옮기기', p => {
        const l = keys.filter(x => x !== k); const t = l.indexOf(targetK); l.splice(pos === 'before' ? t : t + 1, 0, k);
        PDM.deepSet(p, path, l);
      });
      const arrows = (i, n, up, down) => [i > 0 ? { label: '▲', title: '위로', run: up } : null, i < n - 1 ? { label: '▼', title: '아래로', run: down } : null].filter(Boolean);

      const projNode = (i, idx, list) => ({ id: 'i_' + i.id, label: `${i.name}${tierOf(i) ? ' · ' + tierOf(i) + '티어' : ''} (${i.id})`, icon: CAT_ICON[i.category] || '•', open: 'item:' + i.id,
        drag: { kind: 'item', id: i.id },
        canDrop: d => d.kind === 'item' && d.id !== i.id ? ['before', 'after'] : null,
        drop: (d, pos) => placeItem(d.id, i.id, pos),
        actions: list ? arrows(idx, list.length, () => swapWith(list, idx, -1), () => swapWith(list, idx, 1)) : [],
        menu: [{ label: '위로 (순서)', run: () => swapWith(list, idx, -1), disabled: !list || idx === 0 }, { label: '아래로 (순서)', run: () => swapWith(list, idx, 1), disabled: !list || idx === list.length - 1 },
          { label: '다른 분류로 옮기기…', run: () => moveDialog(i) }, '-',
          { label: '복제', run: () => { const c = PDM.clone(i); c.id = i.id + '_copy'; c.name += ' 사본'; if (!store.has('item:' + c.id)) store.add('item:' + c.id, c, '아이템 복제'); } },
          { label: '삭제', run: async () => { if (await PDM.ui.confirm(`「${i.name}」 을(를) 삭제할까요?`)) store.remove('item:' + i.id, '아이템 삭제'); } }] });
      const gameNode = g => ({ id: 'g_' + g.p, label: `${g.n}${g.t ? ' · ' + g.t + '티어' : ''}${g.mod2 ? ' ◆' : ''}${g.added ? ' ＋' : ''}${gameBanned(g.p) ? ' — 등장 금지' : ''}`, icon: gameBanned(g.p) ? '⦸' : '▫', open: 'spditem:' + g.p,
        menu: [{ label: '프로젝트 아이템으로 복사해서 고치기', run: () => copyGameItem(g) },
          { label: gameBanned(g.p) ? '다시 나오게 (등장 금지 풀기)' : '게임에 나오지 않게 (삭제 · 등장 금지)', run: () => toggleBan(g.p) }, { label: 'id 복사 (spd:' + g.p + ')', run: () => { navigator.clipboard && navigator.clipboard.writeText('spd:' + g.p); toast('spd:' + g.p); } }] });
      const leaf = (mine, game) => { const l = sortItems(mine); return [...l.map((x, k) => projNode(x, k, l)), ...game.map(gameNode)]; };
      /** 다른 분류로 옮기기 (끌어 놓기 대신 고르기) */
      const moveDialog = async it => {
        const cats = PDM.itemCategories();
        const catSel = h('select', {}, Object.entries(cats).map(([k, v]) => h('option', { value: k }, v))); catSel.value = cats[it.category] ? it.category : 'misc';
        const subSel = h('select', {});
        const fill = keep => { const ss = PDM.itemSubs(catSel.value) || {}; subSel.replaceChildren(...Object.entries(ss).map(([k, v]) => h('option', { value: k }, v))); subSel.disabled = !Object.keys(ss).length; if (keep !== undefined && ss[keep] !== undefined) subSel.value = keep; };
        fill(subOf(it)); catSel.addEventListener('change', () => fill());
        const ok = await PDM.ui.modal(`「${it.name}」 옮기기`, h('div', { style: { display: 'flex', gap: '8px' } }, h('label', {}, h('div', { class: 'fl' }, '분류'), catSel), h('label', {}, h('div', { class: 'fl' }, '세부 종류'), subSel)), [['취소', null], ['옮기기', true, 'pri']]);
        if (ok) intoGroup(it.id, catSel.value, subSel.disabled ? '' : subSel.value);
      };

      // 분류 순서
      const catOrd = proj.itemCatOrder || [];
      const catKeys = Object.keys(PDM.ITEM_CATEGORY_INFO).filter(cat => PDM.isMod2() || PDM.ITEM_CATEGORY_INFO[cat].note !== 'mod-2' || all.some(i => i.category === cat));
      const cats = catKeys.map((k, i) => [k, catOrd.indexOf(k) < 0 ? 1000 + i : catOrd.indexOf(k)]).sort((a, b) => a[1] - b[1]).map(x => x[0])
        .filter(cat => all.some(i => (i.category || 'misc') === cat) || (G[cat] || []).length);
      return [{ id: 'item', label: '아이템', icon: '🎁', order: 30, count: all.length,
        menu: [{ label: '새 아이템…', run: () => newItem() }],
        children: cats.map((cat, ci) => {
          const info = PDM.ITEM_CATEGORY_INFO[cat];
          const mine = all.filter(i => (i.category || 'misc') === cat), game = G[cat] || [];
          let children;
          const subs = PDM.itemSubs(cat);
          if (subs) {
            const known = Object.keys(subs);
            const shown = known.filter(sk => mine.some(i => subOf(i) === sk) || game.some(x => (x.sub || '') === sk) || (proj.itemSubs || {})[cat] && (proj.itemSubs[cat][sk] !== undefined));
            children = shown.map((sk, si) => {
              const m = mine.filter(i => subOf(i) === sk), gl = game.filter(x => (x.sub || '') === sk);
              return { id: `item_${cat}_${sk || 'base'}`, label: subs[sk], count: m.length + gl.length, children: leaf(m, gl),
                drag: { kind: 'sub', cat, sub: sk },
                canDrop: d => d.kind === 'item' ? ['into'] : d.kind === 'sub' && d.cat === cat && d.sub !== sk ? ['before', 'after'] : null,
                drop: (d, pos) => d.kind === 'item' ? intoGroup(d.id, cat, sk) : moveKey(['itemSubOrder', cat], known, d.sub, sk, pos),
                actions: arrows(si, shown.length, () => moveKey(['itemSubOrder', cat], known, sk, shown[si - 1], 'before'), () => moveKey(['itemSubOrder', cat], known, sk, shown[si + 1], 'after')),
                menu: [{ label: `새 ${subs[sk]}…`, run: () => newItem(cat, sk) }, { label: '세부 종류 관리…', run: () => manageSubs(cat) }] };
            });
            const rest = sortItems(mine.filter(i => !known.includes(subOf(i))));
            children.push(...rest.map((x, k) => projNode(x, k, rest)));
          } else children = leaf(mine, game);
          return { id: 'item_' + cat, label: info.name, icon: info.icon, count: mine.length + game.length, children,
            drag: { kind: 'cat', cat },
            canDrop: d => d.kind === 'item' ? ['into'] : d.kind === 'cat' && d.cat !== cat ? ['before', 'after'] : null,
            drop: (d, pos) => d.kind === 'item' ? intoGroup(d.id, cat) : moveKey(['itemCatOrder'], cats, d.cat, cat, pos),
            actions: arrows(ci, cats.length, () => moveKey(['itemCatOrder'], cats, cat, cats[ci - 1], 'before'), () => moveKey(['itemCatOrder'], cats, cat, cats[ci + 1], 'after')),
            menu: [{ label: `새 ${info.name}…`, run: () => newItem(cat) }, { label: '세부 종류 관리…', run: () => manageSubs(cat) }] };
        }).concat([{ id: 'item_help', label: `▫ = 게임 아이템 ${total}개 (보기 전용 · 우클릭 → 복사해서 고치기)${PDM.isMod2() ? ' · ◆ = mod-2 추가' : ''}`, icon: 'ℹ' },
          { id: 'item_help2', label: '끌어 놓기 또는 ▲▼ 로 순서·분류 옮기기', icon: 'ℹ' }]) }];
    },
    render(key, ctx) {
      const it = store.get(key);
      const { F, section, row } = PDM.ui;
      const prev = h('canvas', { class: 'thumb', width: 64, height: 64 });
      PDM.assets.drawItemSprite(prev, it.sprite, 4);
      const custom = !!it.sprite.png;
      const lovers = store.all('char').filter(c => c.heart && c.heart.enabled && ((c.heart.likes || []).includes(it.id) || (it.tags || []).some(t => (c.heart.likes || []).includes('tag:' + t))));
      const haters = store.all('char').filter(c => c.heart && c.heart.enabled && ((c.heart.dislikes || []).includes(it.id) || (it.tags || []).some(t => (c.heart.dislikes || []).includes('tag:' + t))));
      return h('div', { class: 'page' },
        h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '10px' } }, prev,
          h('div', {}, h('h1', {}, it.name), h('div', { class: 'hint' }, `${it.id} · ${PDM.ITEM_CATEGORIES[it.category] || it.category}${it.tier ? ' · ' + it.tier + '티어' : ''}`),
            h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
              h('button', { class: 'btn sm', title: '이 아이템으로 만들어지는 게임 클래스 (pdmaker/gen/' + PDM.codegen.itemClass(it.id) + '.java)', onclick: () => showCodeFile('pdmaker/gen/' + PDM.codegen.itemPath(it), PDM.codegen.itemClass(it.id) + '.java', PDM.codegen.itemSource(store.get(key))) }, '코드 파일 보기'),
              it.kind === 'game' && it.base ? h('button', { class: 'btn sm', onclick: () => showCodeFile('items/' + it.base.replace(/\./g, '/') + '.java', '게임 코드 — items.' + it.base) }, '바탕 게임 코드 보기') : null))),
        section('기본',
          row(F.text(key, ['name'], { label: '이름', rerender: true })),
          categoryBlock(key, it),
          F.textarea(key, ['desc'], { label: '설명', rows: 3 }),
          row((it.kind || 'misc') === 'misc' ? F.bool(key, ['stackable'], { label: '겹쳐 쌓임' }) : null, F.bool(key, ['unique'], { label: '유일 아이템' }), F.bool(key, ['cursed'], { label: '저주받음' }), F.num(key, ['level'], { label: '생성 시 강화', int: true, min: 0 })),
          F.list(key, ['tags'], { label: '태그', hint: '선물 취향·조건에 씀 (예: herb, gift, undead)' })),
        section('스프라이트',
          h('div', { style: { display: 'flex', gap: '6px', marginBottom: '8px' } },
            h('button', { class: 'btn sm' + (!custom ? ' pri' : ''), onclick: () => store.edit(key, '스프라이트: 게임 시트', o => { o.sprite = { sheet: 'builtin:items', index: o.sprite.index || 0 }; }) }, '게임 items.png 에서 고르기'),
            h('button', { class: 'btn sm' + (custom ? ' pri' : ''), onclick: async () => {
              const rel = it.sprite.png || `assets/sprites/items/${it.id}.png`;
              const sz = await itemCell();
              const out = await PDM.editPixelsModal('아이템 그리기 — ' + it.name, rel, sz, sz);
              if (out) store.edit(key, '스프라이트: 직접 그림', o => { o.sprite = { png: out }; });
            } }, custom ? '그림 편집…' : '직접 그리기…')),
          spriteTools(key, ['sprite'], it.sprite, it.id, it.kind === 'game' ? null : { sheet: 'builtin:items', index: 0 }),
          h('p', { class: 'hint' }, 'PNG 그림은 게임에서 아이템 시트 아래에 붙여 씁니다 (가방·바닥·퀵슬롯 모두). 칸(16px)보다 크면 줄여서 씁니다.' + (PDM.isMod2() ? ' 16px 그림은 mod-2(32px 칸)에서 두 배로 키웁니다.' : '')),
          custom ? F.image(key, ['sprite', 'png'], { label: 'PNG', sub: 'sprites/items', rerender: true })
            : h('div', {}, row(F.text(key, ['sprite', 'name'], { label: '그림 이름 (ItemSpriteSheet 상수)', rerender: true, transform: v => v.trim().toUpperCase() }), F.num(key, ['sprite', 'index'], { label: '번호 (이름이 없을 때)', int: true, min: 0, rerender: true, onchange: () => store.edit(key, '그림 번호', o => { delete o.sprite.name; }) })), sheetPicker(key, it))),
        section('그림 배율', F.num(key, ['groundScale'], { label: '바닥에 놓였을 때 배율 (0 = 기본 1배)', step: 0.1, min: 0, max: 4, hint: '맵 바닥에 떨어져 있는 모습의 크기. 가방·퀵슬롯 칸에서는 항상 칸 크기에 맞춥니다.' })),
        section('드랍 테이블 (어디서 나오는지)',
          h('p', { class: 'hint' }, '몬스터가 죽을 때 떨어뜨리거나, 층을 만들 때 바닥에 놓이게 합니다. 여러 줄을 넣으면 줄마다 따로 확률을 굴립니다.'),
          dropsEditor(key, ['drops'])),
        section('종류와 수치', ...statsSection(key, it)),
        section('소리', ...itemSoundFields(key, it)),
        section('이펙트 (파티클)',
          PDM.ui.row(PDM.ui.F.ref(key, ['fxUse'], 'effect', { label: '쓸 때', empty: '(없음)' }), PDM.ui.F.ref(key, ['fxThrow'], 'effect', { label: '던질 때', empty: '(없음)' }), PDM.ui.F.ref(key, ['fxEquip'], 'effect', { label: '장착 · 해제할 때', empty: '(없음)' })),
          h('p', { class: 'hint' }, '행동 버튼을 누를 때 영웅 위치에서 재생합니다. 이펙트는 리소스 목록의 "이펙트 · 파티클"에서 만듭니다. 다른 위치·시점은 "사용했을 때" 의 이벤트 명령 "이펙트 재생"을 쓰세요.')),
        section('코드 (Java) — 세부 동작', ...codeSection(key, it, ctx)),
        section('사용했을 때 (이벤트 명령)', (it.kind || 'misc') === 'misc' ? PDM.commandList(key, ['onUse']) : h('p', { class: 'hint' }, '무기·갑옷은 사용 명령 대신 위의 코드 훅과 행동 버튼을 씁니다.')),
        section('선물 반응',
          h('div', { class: 'kv' }, h('b', {}, '좋아하는 캐릭터'), h('span', {}, lovers.map(c => c.name).join(', ') || '없음'), h('b', {}, '싫어하는 캐릭터'), h('span', {}, haters.map(c => c.name).join(', ') || '없음')),
          h('p', { class: 'hint' }, '캐릭터 편집기의 "좋아하는 것/싫어하는 것" 에 이 아이템 id 나 태그를 넣으면 반영됩니다.')));
    }
  });
  // ---------------- 드랍 테이블 (아이템이 어디서 나오는지) — 런타임 MakerDrops ----------------
  /** 드랍 줄 편집: { src: mob|floor, char, chance, min, max, depthMin, depthMax, groups, cond } */
  function dropsEditor(skey, path) {
    const { F, row } = PDM.ui;
    const mobs = () => store.all('char').filter(c => ['mob', 'boss'].includes(c.kind)).map(c => [c.id, `${c.name} (${c.id})`]);
    const groups = () => ((store.get('world') || {}).groups || []).filter(g => !g.safe);
    return PDM.ui.listEditor(skey, path, { addLabel: '드랍 추가', emptyText: '드랍 없음 — 이 아이템은 시작 아이템·맵에 놓기·이벤트·게임 원래 규칙으로만 나옵니다',
      make: () => ({ src: 'mob', char: (mobs()[0] || [''])[0], chance: 10, min: 1, max: 1, cond: '' }),
      render: (it, i, p) => h('div', {},
        row(F.select(skey, [...p, 'src'], { mob: '몬스터가 죽을 때', floor: '층 바닥에 (층을 만들 때)' }, { label: '어디서', rerender: true }),
          it.src === 'floor' ? null : F.select(skey, [...p, 'char'], mobs(), { label: '몬스터', empty: '(고르기)' }),
          F.num(skey, [...p, 'chance'], { label: '확률(%)', min: 0, max: 100, step: 0.1, dec: 1 }),
          F.num(skey, [...p, 'min'], { label: '개수 최소', int: true, min: 1 }), F.num(skey, [...p, 'max'], { label: '최대', int: true, min: 1 })),
        it.src === 'floor' ? row(F.num(skey, [...p, 'depthMin'], { label: '깊이 최소 (0 = 제한 없음)', int: true, min: 0 }), F.num(skey, [...p, 'depthMax'], { label: '깊이 최대 (0 = 제한 없음)', int: true, min: 0 }),
          PDM.ui.field('그룹 (안 고르면 전부)', h('div', {}, groups().map(g => h('label', { style: { marginRight: '8px' } },
            h('input', { type: 'checkbox', checked: (it.groups || []).includes(g.id), onchange: e => store.edit(skey, '드랍 그룹', o => { const d = PDM.deepGet(o, p); const a = new Set(d.groups || []); e.target.checked ? a.add(g.id) : a.delete(g.id); d.groups = [...a]; }) }), ' ' + g.name))))) : null,
        F.cond(skey, [...p, 'cond'], { label: '조건 (선택)' })) });
  }
  /** 이 캐릭터가 떨어뜨리는 아이템 [[탭 키, 이름 확률]] */
  PDM.dropsFrom = function (charId) {
    const out = [];
    store.all('item').forEach(it => (it.drops || []).forEach(d => { if (d.src !== 'floor' && d.char === charId) out.push(['item:' + it.id, `${it.name} ${d.chance}%`]); }));
    Object.entries((store.get('gameitems') || {}).items || {}).forEach(([k, v]) => (v.drops || []).forEach(d => { if (d.src !== 'floor' && d.char === charId) { const [, g] = findGame(k.slice(4)); out.push(['spditem:' + k.slice(4), `${g ? g.n : k} ${d.chance}%`]); } }));
    return out;
  };
  const gameBanned = p => !!((((store.get('gameitems') || {}).items || {})['spd:' + p] || {}).banned);
  const toggleBan = p => store.edit('gameitems', '게임 아이템 등장 금지', r => { r.items = r.items || {}; const e = r.items['spd:' + p] = r.items['spd:' + p] || {}; if (e.banned) { delete e.banned; if (!Object.keys(e).length) delete r.items['spd:' + p]; } else e.banned = true; });

  /** 게임 아이템 보기 (spditem:<경로>) — 보기 전용, 복사해서 프로젝트 아이템으로 */
  const findGame = p => { for (const [c, l] of Object.entries(PDM.SPD_ITEM_GROUPS || {})) { const g = l.find(x => x.p === p); if (g) return [c, g]; } return [null, null]; };
  PDM.registerEditor({
    id: 'spditem', icon: () => '▫',
    match: k => k.startsWith('spditem:'),
    watch: (ck, tk) => ck === 'sounds' || ck === 'gameitems' || ck === tk || ck.startsWith('item:'),
    title: k => { const [, g] = findGame(k.slice(8)); return g ? g.n : k; },
    render(key) {
      const [cat, g] = findGame(key.slice(8));
      if (!g) return h('div', { class: 'page' }, h('p', {}, '게임 아이템을 찾지 못했습니다: ' + key));
      const info = PDM.ITEM_CATEGORY_INFO[cat] || {};
      const prev = h('canvas', { class: 'thumb', width: 64, height: 64 });
      PDM.assets.drawItemSprite(prev, { sheet: 'builtin:items', name: g.img }, 4);
      const users = store.all('hero').filter(hr => ((hr.inventory || {}).items || []).some(x => x.item === 'spd:' + g.p)).map(hr => '영웅 ' + hr.name + ' 시작 아이템');
      return h('div', { class: 'page' },
        h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '10px' } }, prev,
          h('div', {}, h('h1', {}, g.n, g.mod2 ? h('span', { class: 'badge', style: { marginLeft: '8px' } }, 'mod-2') : null),
            h('div', { class: 'hint' }, `게임 아이템 · ${info.name || cat}${g.sub && info.subs ? ' › ' + info.subs[g.sub] : ''}${g.t ? ' · ' + g.t + '티어' : ''}`),
            h('div', { style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: () => showCodeFile('items/' + g.p.replace(/\./g, '/') + '.java', '게임 코드 — items.' + g.p) }, '게임 코드 파일 보기')))),
        PDM.ui.section('설명', h('p', { style: { whiteSpace: 'pre-wrap' } }, (g.d || '(설명 없음)').replace(/\\n/g, '\n').replace(/_([^_]+)_/g, '$1'))),
        (() => {
          const gk = 'spd:' + g.p, cur = (((store.get('gameitems') || {}).items || {})[gk] || {}).sprite || null;
          const pv = h('canvas', { class: 'thumb', width: 64, height: 64, style: { imageRendering: 'pixelated' } });
          PDM.assets.drawItemSprite(pv, cur || { sheet: 'builtin:items', name: g.img }, 4);
          return PDM.ui.section('그림 바꾸기',
            h('p', { class: 'hint' }, '이 프로젝트에서 게임의 이 아이템(어디서 나오든)을 다른 그림으로 보여 줍니다. gameitems.json 에 저장.'),
            h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, pv,
              h('div', {}, h('div', {}, cur ? (cur.png ? 'PNG: ' + cur.png : '게임 시트: ' + (cur.name || '#' + cur.index)) : '게임 원래 그림 (' + g.img + ')'),
                cur ? h('button', { class: 'btn sm', style: { marginTop: '4px' }, onclick: () => store.edit('gameitems', '게임 아이템 그림 원래대로', r => { if (r.items && r.items[gk]) { delete r.items[gk].sprite; if (!Object.keys(r.items[gk]).length) delete r.items[gk]; } }) }, '원래 그림으로') : null)),
            itemSpriteField('gameitems', ['items', gk, 'sprite'], { label: '게임 시트의 다른 칸으로' }),
            spriteTools('gameitems', ['items', gk, 'sprite'], cur, g.p.split('.').pop().toLowerCase(), { sheet: 'builtin:items', name: g.img }),
            cur && cur.png ? PDM.ui.F.image('gameitems', ['items', gk, 'sprite', 'png'], { label: 'PNG', sub: 'sprites/items', rerender: true }) : null);
        })(),
        PDM.ui.section('등장 · 드랍 테이블',
          PDM.ui.F.bool('gameitems', ['items', 'spd:' + g.p, 'banned'], { label: '게임에 나오지 않게 (등장 금지) — 게임의 무작위 아이템 생성(바닥·상자·전리품·상점 무작위 칸)에서 뺍니다', rerender: true }),
          h('p', { class: 'hint' }, '등장 금지는 "무작위로 뽑는 곳"에만 적용됩니다. 직업의 시작 아이템, 퀘스트 보상처럼 게임 코드가 정해 놓고 주는 것은 그대로 나옵니다. 아래 드랍은 게임 원래 규칙에 더해집니다.'),
          dropsEditor('gameitems', ['items', 'spd:' + g.p, 'drops'])),
        PDM.ui.section('코드로 고치기',
          h('p', { class: 'hint' }, '이 게임 아이템을 바탕(상속)으로 한 프로젝트 아이템을 만들고, 그 아이템의 "코드"에서 훅·행동 버튼·추가 멤버(@Override)로 동작을 직접 고칩니다. 게임 효과·강화는 그대로 유지됩니다. 만든 아이템은 시작 아이템·상점·이벤트에서 그 id 로 씁니다.'),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            h('button', { class: 'btn sm pri', onclick: () => inheritGameItem(g) }, '이 아이템을 바탕으로 코드 작성…'),
            ...store.all('item').filter(x => x.kind === 'game' && x.base === g.p).map(x => h('button', { class: 'chip', onclick: () => PDM.tabs.open('item:' + x.id) }, `${x.name || x.id} (${x.id})`)))),
        PDM.ui.section('소리', h('p', { class: 'hint' }, `이 프로젝트에서 게임 아이템 「${g.n}」 에 쓸 소리입니다 (audio/sounds.json 에 저장 · 이 아이템을 쓰는 곳 모두에 적용).`),
          ...itemSoundFields('spd:' + g.p, null, true)),
        PDM.ui.section('쓰는 법',
          h('div', { class: 'kv' },
            h('b', {}, '아이템 id'), h('code', {}, 'spd:' + g.p),
            h('b', {}, '게임 클래스'), h('code', {}, 'items.' + g.p),
            h('b', {}, '그림'), h('code', {}, g.img),
            h('b', {}, '쓰는 곳'), h('span', {}, users.join(', ') || '없음')),
          h('p', { class: 'hint' }, '영웅 시작 아이템 · 이벤트의 아이템 주기 · 상점 등에 id 를 그대로 쓰면 게임의 이 아이템이 나옵니다. 이름·수치·그림을 바꾸고 싶으면 프로젝트 아이템으로 복사해서 고치세요.'),
          h('div', { style: { display: 'flex', gap: '6px' } },
            h('button', { class: 'btn sm pri', onclick: () => copyGameItem(g) }, '프로젝트 아이템으로 복사해서 고치기'),
            h('button', { class: 'btn sm', onclick: () => { navigator.clipboard && navigator.clipboard.writeText('spd:' + g.p); toast('복사함: spd:' + g.p); } }, 'id 복사'))));
    }
  });
  PDM.items = { newItem };
})();
