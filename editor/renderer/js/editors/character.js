// ================================================================
//  캐릭터 편집기 — NPC · 동료 · 몬스터 · 보스  (플레이어블 영웅은 영웅 편집기 hero.js)
//   스프라이트/애니메이션, 초상화·표정, 능력치, AI·경로, 마음(era), 구상 대사, 행동 이벤트
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const KIND_ICON = { npc: '☺', companion: '♥', mob: '☗', boss: '☠' };

  async function newCharacter(kind) {
    const id = await PDM.ui.prompt('새 캐릭터 id (영문, 파일 이름이 됩니다)', '');
    if (!id) return;
    const clean = PDM.slugId(id);
    if (store.has('char:' + clean)) { toast('같은 id 가 있습니다', 'bad'); return; }
    const c = PDM.make.character(clean, kind); c.name = id;
    store.add('char:' + clean, c, '캐릭터 추가');
    PDM.tabs.open('char:' + clean);
  }
  // id 바꾸기 · 복제는 공용 resOps (쓰는 곳도 함께 고침)
  const renameChar = id => PDM.resOps.renameId('char', id);
  const dupChar = id => PDM.resOps.dup('char', id);

  /** 게임 sprites 폴더의 PNG 목록 (한 번만 읽음) */
  let gameSpriteList = null;
  async function gameSprites() {
    if (gameSpriteList) return gameSpriteList;
    const g = store.gameAssetsDir(); if (!g) return [];
    try { gameSpriteList = (await pdm.list(pdm.join(g, 'sprites'))).filter(f => f.name.endsWith('.png')).map(f => 'game:sprites/' + f.name); }
    catch (_) { gameSpriteList = []; }
    return gameSpriteList;
  }
  store.on('load', () => { gameSpriteList = null; });

  // ---------- 애니메이션 미리보기 ----------
  //  실제 흐른 시간으로 프레임을 넘김 (예전에는 50ms 타이머에 맞춰 넘겨서 fps 10~19 가 모두 같은 속도로 보였음)
  function animPreview(c, animKey, ctx, rowOf) {
    const cv = h('canvas', { class: 'anim-prev', width: 72, height: 72 });
    let img = null, acc = 0, frame = 0, last = performance.now(), raf = 0, alive = true, seen = false;
    PDM.assets.load(c.sprite.sheet).then(i => { img = i; });
    const tick = now => {
      if (!alive) return;
      if (cv.isConnected) seen = true; else if (seen) { alive = false; return; }   // 다시 그려져서 떨어져 나간 미리보기는 멈춤
      raf = requestAnimationFrame(tick);
      const dt = Math.min(250, now - last); last = now;
      const a = (c.sprite.anims || {})[animKey]; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 72, 72);
      if (!img || !a || !a.frames || !a.frames.length) return;
      const step = 1000 / Math.max(1, a.fps || 10);
      acc += dt;
      while (acc >= step) { acc -= step; frame++; if (frame >= a.frames.length) frame = a.loop ? 0 : a.frames.length - 1; }
      if (frame >= a.frames.length) frame = 0;
      const [fw, fh] = c.sprite.frame; const fit = 64 / Math.max(fw, fh), sc = fit >= 1 ? Math.floor(fit) : fit;   // 64px 보다 큰 프레임은 줄여서 (예전에는 1배로 그려 잘렸음)
      let n = a.frames[frame] | 0;
      if (rowOf) { const cols = Math.max(1, Math.floor(img.width / fw)); n = rowOf(img) * cols + Math.min(n, cols - 1); }
      PDM.assets.drawFrame(g, img, fw, fh, n, (72 - fw * sc) / 2, (72 - fh * sc) / 2, sc);
    };
    raf = requestAnimationFrame(tick);
    cv.addEventListener('click', () => { frame = 0; acc = 0; });
    const prev = ctx._stop || (() => {}); ctx._stop = () => { prev(); alive = false; cancelAnimationFrame(raf); };
    return cv;
  }

  // ---------- 시트 맞춤 검사 (다른 시트로 바꿨을 때: 예 — 원작 영웅을 복제해 새 시트를 넣으면 원작의 12×15 프레임 · 0~20번 애니메이션이 그대로 남음) ----------
  /** 시트 크기와 프레임 크기 · 애니메이션 프레임 번호가 맞는지 → { fits, cols, rows, bad: {애니: [번호]}, cands: [[w,h]] } */
  PDM.sheetFit = function (sp, img, armorRows) {
    const fw = +(sp.frame || [])[0] || 1, fh = +(sp.frame || [])[1] || 1, W = img.width, H = img.height;
    const fits = W % fw === 0 && H % fh === 0 && fw <= W && fh <= H;
    const cols = Math.max(1, Math.floor(W / fw)), rows = Math.max(1, Math.floor(H / fh));
    const max = armorRows ? cols : cols * rows, bad = {};   // 영웅(갑옷 단계 행): 번호는 한 줄 안 — 게임은 줄 끝 프레임으로 바꿔 씀
    for (const [k, a] of Object.entries(sp.anims || {})) { const b = [...new Set((a.frames || []).filter(n => n < 0 || n >= max))]; if (b.length) bad[k] = b; }
    // 프레임 크기 후보: 정사각형(가로 · 세로 모두 나눔) 큰 것부터, 한 줄 시트(세로 = 시트 높이), 지금 가로/세로 하나만 맞추기
    const c = [], add = (w, hh) => { if (w >= 8 && hh >= 8 && W % w === 0 && H % hh === 0 && !c.some(x => x[0] === w && x[1] === hh) && !(w === fw && hh === fh)) c.push([w, hh]); };
    if (W % H === 0) add(H, H);
    for (let q = Math.min(W, H); q >= 8; q--) if (W % q === 0 && H % q === 0) add(q, q);
    if (W % fw === 0) for (let q = Math.min(H, 256); q >= 8; q--) if (H % q === 0) { add(fw, q); break; }
    return { fits, cols, rows, bad, cands: c.slice(0, 5) };
  };
  function sheetFitBox(key, c, armorRows) {
    const box = h('div', {});
    PDM.assets.load(c.sprite.sheet).then(img => {
      if (!img) return;
      const r = PDM.sheetFit(c.sprite, img, armorRows), badN = Object.keys(r.bad).length;
      if (r.fits && !badN) return;
      const [fw, fh] = c.sprite.frame;
      const setFrame = (w, hh) => store.edit(key, '프레임 크기 (시트에 맞춤)', o => { o.sprite.frame = [w, hh]; });
      const fixAnims = () => store.edit(key, '애니메이션 프레임 정리 (시트에 맞춤)', o => {
        const f = PDM.sheetFit(o.sprite, img, armorRows), max = armorRows ? f.cols : f.cols * f.rows;
        for (const a of Object.values(o.sprite.anims || {})) a.frames = (a.frames || []).map(n => Math.max(0, Math.min(max - 1, n | 0)));
      });
      const resetAnims = () => store.edit(key, '애니메이션 새로 (시트에 맞춤)', o => {
        const f = PDM.sheetFit(o.sprite, img, armorRows), n = armorRows ? f.cols : f.cols * f.rows, seq = k => Array.from({ length: Math.min(n, k) }, (_, i) => i);
        o.sprite.anims = { idle: { frames: [0], fps: 1, loop: true }, run: { frames: seq(4), fps: 10, loop: true }, attack: { frames: seq(3), fps: 15, loop: false }, die: { frames: seq(3), fps: 10, loop: false } };
        if (armorRows) o.sprite.tierRows = [0, 0, 0, 0, 0, 0, 0];   // 새 시트는 보통 갑옷 단계 줄이 없음 — 모든 단계가 0행
        delete o.sprite.rowsChecked;
      });
      box.append(h('div', { class: 'callout warn', style: { margin: '4px 0 8px', padding: '8px 10px', border: '1px solid var(--warn, #c9a227)', borderRadius: '6px' } },
        h('b', {}, '⚠ 시트와 설정이 맞지 않습니다'), ' ',
        h('span', { class: 'hint' }, `시트 ${img.width}×${img.height}px · 프레임 ${fw}×${fh}px` + (r.fits ? ` → ${r.cols}열 × ${r.rows}행` : ' — 시트 크기가 프레임 크기로 나누어떨어지지 않음')),
        !r.fits || r.cands.length ? h('div', { class: 'hstack wrap', style: { marginTop: '6px', gap: '4px' } }, h('span', { class: 'hint' }, '프레임 크기:'),
          ...r.cands.map(([w, hh]) => h('button', { class: 'btn xs', onclick: () => setFrame(w, hh) }, `${w}×${hh} (${img.width / w}열 × ${img.height / hh}행)`))) : null,
        badN ? h('div', { style: { marginTop: '6px' } },
          h('div', { class: 'hint' }, '시트에 없는 프레임 번호 (다른 시트에서 가져온 설정 — 게임에서는 ' + (armorRows ? '줄 끝 프레임' : '첫 프레임 근처') + '으로 바뀌어 보임): ' + Object.entries(r.bad).map(([k, b]) => `${k} ${b.join(',')}`).join(' · ')),
          h('div', { class: 'hstack wrap', style: { marginTop: '4px', gap: '4px' } },
            h('button', { class: 'btn xs', onclick: fixAnims }, '번호를 시트 안으로 줄이기'),
            h('button', { class: 'btn xs', onclick: resetAnims }, '애니메이션을 이 시트에 맞게 새로' + (armorRows ? ' (갑옷 단계 행도 0행으로)' : '')))) : null));
    }).catch(() => {});
    return box;
  }

  // ---------- 스프라이트 시트 보기 (프레임 번호 클릭 → 현재 애니메이션에 추가) ----------
  function sheetView(key, c, state) {
    const cv = h('canvas', {});
    const wrap = h('div', { class: 'sheet-view' }, cv);
    PDM.assets.load(c.sprite.sheet).then(img => {
      if (!img) { wrap.replaceChildren(h('div', { class: 'empty', style: { padding: '12px' } }, '시트 이미지를 불러오지 못했습니다')); return; }
      const [fw, fh] = c.sprite.frame; const sc = Math.max(1, Math.min(3, Math.floor(48 / Math.max(fw, fh))));
      cv.width = img.width * sc; cv.height = img.height * sc;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, cv.width, cv.height);
      const cols = Math.floor(img.width / fw), rows = Math.floor(img.height / fh);
      g.strokeStyle = 'rgba(165,139,255,.45)'; g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '10px monospace';
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) { g.strokeRect(q * fw * sc + .5, r * fh * sc + .5, fw * sc, fh * sc); g.fillText(r * cols + q, q * fw * sc + 2, r * fh * sc + 10); }
      cv.onclick = e => {
        const b = cv.getBoundingClientRect(); const q = Math.floor((e.clientX - b.left) / (fw * sc)), r = Math.floor((e.clientY - b.top) / (fh * sc));
        const n = r * cols + q;
        store.edit(key, '프레임 추가', o => { const a = o.sprite.anims[state.anim] = o.sprite.anims[state.anim] || { frames: [], fps: 10, loop: true }; a.frames.push(n); });
      };
    });
    return wrap;
  }

  // ---------- 경로 찍기 (층 미니맵) ----------
  function pathPicker(key, c) {
    const nodes = store.all('node').filter(f => f.mode !== 'procedural');
    if (!nodes.length) return h('div', { class: 'hint' }, '직접 그린 맵(노드)이 있어야 지도에서 경로를 찍을 수 있습니다. 아래 목록에 좌표를 직접 넣어도 됩니다.');
    const st = { node: c.ai.pathNode && store.get('node:' + c.ai.pathNode) ? c.ai.pathNode : nodes[0].id };
    const sel = h('select', { onchange: () => { st.node = sel.value; store.edit(key, '경로 맵', o => { o.ai.pathNode = st.node; }, { silent: true }); draw(); } }, nodes.map(n => h('option', { value: n.id }, PDM.World.fullName(n.id))));
    sel.value = st.node;
    const cv = h('canvas', { style: { cursor: 'crosshair', imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '4px', maxWidth: '100%' } });
    async function draw() {
      const fl = store.get('node:' + st.node); const s = 10;
      cv.width = fl.size.w * s; cv.height = fl.size.h * s;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      const tiles = await PDM.assets.themeTiles((PDM.World.themeOf(fl.id) || '').replace('custom:', ''));
      for (let y = 0; y < fl.size.h; y++) for (let x = 0; x < fl.size.w; x++) PDM.assets.drawTerrain(g, tiles, fl.layers.terrain[y * fl.size.w + x], x * s, y * s, s);
      const pts = c.ai.path || [];
      g.strokeStyle = '#ffde59'; g.lineWidth = 2; g.beginPath();
      pts.forEach((p, i) => { const X = p.x * s + s / 2, Y = p.y * s + s / 2; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
      pts.forEach((p, i) => { g.fillStyle = i ? '#ffde59' : '#5fd6b4'; g.fillRect(p.x * s + 2, p.y * s + 2, s - 4, s - 4); });
    }
    cv.onclick = e => { const b = cv.getBoundingClientRect(); const sx = cv.width / b.width; const x = Math.floor((e.clientX - b.left) * sx / 10), y = Math.floor((e.clientY - b.top) * sx / 10); store.edit(key, '경로 점 추가', o => { o.ai.path = o.ai.path || []; o.ai.path.push({ x, y }); o.ai.pathNode = st.node; }); };
    cv.oncontextmenu = e => { e.preventDefault(); store.edit(key, '경로 점 삭제', o => { (o.ai.path || []).pop(); }); };
    draw();
    return h('div', {}, h('div', { class: 'row' }, PDM.ui.field('맵', sel)), cv, h('div', { class: 'hint' }, '클릭 = 점 추가, 오른쪽 클릭 = 마지막 점 삭제. 초록 = 시작점'));
  }

  // ---------- 대사 테스트 ----------
  function dialogueTester(c) {
    const out = h('div', { class: 'sim-log' });
    const sys = store.get('heart');
    const rec = PDM.Heart.newRecord(c);
    const favor = h('input', { type: 'number', value: rec.favor, style: { width: '90px' } });
    const trust = h('input', { type: 'number', value: rec.trust, style: { width: '90px' } });
    const topic = h('select', {}, (sys.topics || []).map(t => h('option', { value: t.key }, t.name)));
    const run = () => {
      rec.favor = +favor.value; rec.trust = +trust.value;
      const line = PDM.Heart.pickLine(sys, rec, c, topic.value);
      out.prepend(h('div', {}, `[${topic.value} · 호감 ${rec.favor} 신뢰 ${rec.trust}] `, line ? h('b', { style: { color: 'var(--fg)' } }, `${line.face ? '(' + line.face + ') ' : ''}${line.text}`) : h('i', {}, '맞는 대사 없음 → 공용 대사 사용')));
    };
    return h('div', {}, h('div', { class: 'hstack wrap' },
      '토픽', topic, PDM.T('rel.favor'), favor, PDM.T('rel.trust'), trust, h('button', { class: 'btn sm', onclick: run }, '대사 뽑기'),
      h('button', { class: 'btn sm', onclick: () => PDM.heartSim && PDM.heartSim(c.id) }, '마음 시뮬레이터…')), out);
  }


  /** 상인 기능: 파는 물건 목록 (런타임 MakerShop — 사고파는 창을 따로 띄움) */
  function shopEditor(key, c) {
    const sh = c.shop || {}, { F, row } = PDM.ui;
    const on = h('input', { type: 'checkbox', checked: !!sh.on });
    on.onchange = () => store.edit(key, '상인 기능', o => { o.shop = Object.assign({ title: '', greet: '', items: [], priceRate: 300, sell: true, sellRate: 50, direct: false }, o.shop || {}, { on: on.checked }); });
    const head = h('label', { class: 'check' }, on, h('b', {}, '🛒 이 캐릭터를 상인으로 쓰기'), h('span', { class: 'hint ml-3' }, '말을 걸면 아이템을 사고파는 창이 뜹니다'));
    if (!sh.on) return [head, h('p', { class: 'hint' }, '게임 원래 상점(바닥에 놓인 물건을 직접 집어서 사는 방식)과 달리, 파는 물건 목록을 여기서 정하고 창에서 사고팝니다.')];
    const ed = (lbl, fn, rr) => store.edit(key, lbl, o => fn(o.shop), rr === false ? { silent: true } : undefined);
    const numI = (v, fn, min, ph) => { const i = h('input', { type: 'number', value: v, min, placeholder: ph || '', style: { width: '84px' } }); i.onchange = () => fn(Math.max(min, i.value | 0)); return i; };
    const rows = (sh.items || []).map((e, i) => h('tr', {},
      h('td', {}, PDM.itemInput ? PDM.itemInput(e.item, v => ed('파는 물건', s => { s.items[i].item = v; }, false)) : null),
      h('td', {}, numI(e.price || 0, v => ed('값', s => { s.items[i].price = v; }, false), 0)),
      h('td', {}, numI(e.stock ?? -1, v => ed('재고', s => { s.items[i].stock = v; }, false), -1)),
      h('td', { class: 'nowrap' },
        h('button', { class: 'btn xs', disabled: i === 0, onclick: () => ed('순서', s => { [s.items[i - 1], s.items[i]] = [s.items[i], s.items[i - 1]]; }) }, '↑'),
        h('button', { class: 'btn xs', disabled: i === sh.items.length - 1, onclick: () => ed('순서', s => { [s.items[i + 1], s.items[i]] = [s.items[i], s.items[i + 1]]; }) }, '↓'),
        h('button', { class: 'btn xs danger', onclick: () => ed('물건 삭제', s => { s.items.splice(i, 1); }) }, '×'))));
    return [head,
      row(F.text(key, ['shop', 'title'], { label: '가게 이름 (비우면 캐릭터 이름)' }), F.text(key, ['shop', 'greet'], { label: '창 위쪽 인사말 (선택)' })),
      h('div', { class: 'fl mt-3' }, `파는 물건 (${(sh.items || []).length})`),
      h('table', { class: 'grid' }, h('tr', {}, h('th', {}, '아이템 (프로젝트 아이템 · 게임 아이템)'), h('th', { style: { width: '100px' } }, '값 (0 = 자동)'), h('th', { style: { width: '100px' } }, '재고 (-1 = 무제한)'), h('th', { style: { width: '90px' } }, '')), ...rows),
      h('button', { class: 'btn xs add mt-2', onclick: () => ed('물건 추가', s => { s.items = s.items || []; s.items.push({ item: '', price: 0, stock: -1 }); }) }, '+ 물건 추가'),
      row(F.num(key, ['shop', 'priceRate'], { label: '자동 값 = 아이템 가치의 몇 %', int: true, min: 1, def: 300 }),
        F.bool(key, ['shop', 'sell'], { label: '영웅이 가진 물건을 팔 수 있음 ("팔기" 탭)', def: true, rerender: true }),
        sh.sell !== false ? F.num(key, ['shop', 'sellRate'], { label: '사 주는 값 = 아이템 가치의 몇 %', int: true, min: 1, def: 50 }) : null),
      F.bool(key, ['shop', 'direct'], { label: '말을 걸면 묻지 않고 바로 상인 창 (끄면: 다른 대화 · 이벤트가 있을 때 "물건 보기 / 대화하기"를 먼저 고름)' }),
      h('p', { class: 'hint' }, '재고는 저장 파일에 함께 저장됩니다. 이벤트에서 열려면 명령 "상인 창 열기"를 씁니다 (대화 선택지 안에 넣을 수 있음).')];
  }

  /** 스프라이트 시트 · 프레임 · 배율 · 애니메이션 편집 (캐릭터 편집기와 영웅 편집기가 함께 씀) */
  function spriteEditor(key, c, ctx, st) {
    const { F, row } = PDM.ui;
    st = st || (ctx.state = ctx.state || { anim: 'idle' });
    if (!st.anim) st.anim = 'idle';
    c.sprite.anims = c.sprite.anims || {};
      // 게임 스프라이트 빠른 선택
    const quick = h('select', { onchange: () => { if (quick.value) { store.edit(key, '시트 변경', o => { o.sprite.sheet = quick.value; }); } } }, h('option', { value: '' }, '게임 스프라이트에서 고르기…'));
    gameSprites().then(list => list.forEach(p => quick.append(h('option', { value: p }, p.slice(13)))));

    const isHero = key.startsWith('hero:');
    const BASE = isHero ? PDM.ANIM_KEYS_HERO : PDM.ANIM_KEYS_CHAR;
    const keys = [...BASE, ...Object.keys(c.sprite.anims || {}).filter(k => !BASE.includes(k))];
    // 미리보기에서 보여 줄 갑옷 단계 행 (영웅 시트)
    const armorRows = isHero && c.sprite.armorRows !== false;
    const pvTier = st.pvTier || 0;
    const rowOf = armorRows ? img => { const rows = Math.max(1, Math.floor(img.height / c.sprite.frame[1])); const tr = c.sprite.tierRows; const r = tr && tr.length ? tr[Math.min(pvTier, tr.length - 1)] : pvTier; return Math.max(0, Math.min(rows - 1, r | 0)); } : null;
    const animRows = h('div', {});
    const create = (ak, def) => { st.anim = ak; store.edit(key, '애니메이션 추가', o => { o.sprite.anims[ak] = def || { frames: [0], fps: 10, loop: ak === 'idle' || ak === 'run' || ak === 'fly' || ak === 'dead' }; }); };
    keys.forEach(ak => {
      const a = (c.sprite.anims || {})[ak];
      const custom = !BASE.includes(ak);
      animRows.append(h('div', { class: 'li', style: { alignItems: 'center', marginBottom: '6px', outline: st.anim === ak ? '1px solid var(--accent)' : '' }, onclick: e => { if (st.anim !== ak && !/INPUT|BUTTON/.test(e.target.tagName)) { st.anim = ak; ctx.refresh(); } } },
        a ? animPreview(c, ak, ctx, rowOf) : h('div', { style: { width: '72px' } }),
        h('div', { class: 'grow' },
          h('b', {}, ak, ' ', h('span', { class: 'hint' }, custom ? '추가 애니메이션 (이벤트 "애니메이션 재생")' : (PDM.ANIM_NAMES[ak] || ''))),
          st.anim === ak ? h('span', { class: 'badge good ml-3' }, '시트 클릭 → 여기에 추가') : null,
          a ? row(PDM.ui.field('프레임 번호 (쉼표로 구분)', (() => { const fi = h('input', { type: 'text', value: (a.frames || []).join(', ') }); fi.addEventListener('change', () => store.edit(key, '프레임', o => { o.sprite.anims[ak].frames = fi.value.split(/[ ,]+/).filter(Boolean).map(Number).filter(n => !isNaN(n)); })); return fi; })()),
            F.num(key, ['sprite', 'anims', ak, 'fps'], { label: 'fps', min: 1, max: 60, int: true }), F.bool(key, ['sprite', 'anims', ak, 'loop'], { label: '반복' }))
            : h('button', { class: 'btn sm', onclick: () => create(ak) }, '+ 이 애니메이션 만들기')),
        a ? h('button', { class: 'ib danger', title: '애니메이션 삭제', onclick: e => { e.stopPropagation(); if (st.anim === ak) st.anim = 'idle'; store.edit(key, '애니메이션 삭제', o => { delete o.sprite.anims[ak]; }); } }, '✕') : null));
    });
    animRows.append(h('div', { class: 'hstack wrap' },
      h('button', { class: 'btn sm', onclick: async () => {
        const n = await PDM.ui.prompt('새 애니메이션 이름 (영문)', '', '예: cast, dance, hurt, sit — 이벤트 명령 "애니메이션 재생"에서 이 이름으로 틉니다');
        if (!n) return;
        const id = PDM.slugId(n);
        if ((c.sprite.anims || {})[id]) { st.anim = id; ctx.refresh(); return; }
        create(id, { frames: [0], fps: 10, loop: false });
      } }, '+ 새 애니메이션 추가'),
      h('span', { class: 'hint' }, isHero ? 'fly = 공중부양·점프 중, read = 주문서 읽을 때. 비워 두면 가만히 / 조작 동작을 씁니다. dead = die(쓰러짐)가 끝난 뒤 이어서 반복할 동작 — 비워 두면 die 의 마지막 프레임에서 멈춥니다.' : 'fly = 날개가 있거나 떠 있는 캐릭터가 가만히·이동할 때.')));

    // 갑옷 단계 → 시트 행 (영웅)
    const tierBox = armorRows ? (() => {
      const tr = c.sprite.tierRows && c.sprite.tierRows.length ? c.sprite.tierRows : null;
      const TIERS = ['0 (갑옷 없음)', '1 (천)', '2 (가죽)', '3 (사슬)', '4 (비늘)', '5 (판금)', '6 (직업 갑옷)'];
      const setRows = rows => store.edit(key, '갑옷 단계 행', o => { if (rows) o.sprite.tierRows = rows; else delete o.sprite.tierRows; });
      const cur = t => tr ? tr[Math.min(t, tr.length - 1)] : t;
      return h('div', { class: 'tier-rows m-0 mt-3 mb-5' },
        h('div', { class: 'fl' }, '갑옷 단계별로 쓸 시트 행'),
        h('div', { class: 'flex gap-2 wrap m-0 mt-1 mb-3' },
          h('button', { class: 'btn xs' + (!tr ? ' pri' : ''), onclick: () => setRows(null) }, '자동 (단계 = 행)'),
          h('button', { class: 'btn xs', onclick: () => setRows([0, 0, 0, 0, 0, 0, 0]) }, '0행만 사용'),
          ...[1, 2, 3, 4, 5].map(m => h('button', { class: 'btn xs', onclick: () => setRows([0, 1, 2, 3, 4, 5, 6].map(t => Math.min(t, m))) }, `${m}행까지`))),
        h('div', { class: 'row wrap' }, ...TIERS.map((nm, t) => {
          const inp = h('input', { type: 'number', min: 0, max: 20, value: cur(t), style: { width: '60px' } });
          inp.addEventListener('change', () => { const rows = [0, 1, 2, 3, 4, 5, 6].map(i => cur(i)); rows[t] = Math.max(0, inp.value | 0); setRows(rows); });
          return PDM.ui.field('갑옷 ' + nm, inp);
        })),
        h('div', { class: 'hstack' }, h('span', { class: 'hint' }, '미리보기 단계:'),
          ...[0, 1, 2, 3, 4, 5, 6].map(t => h('button', { class: 'chip' + (pvTier === t ? ' on' : ''), onclick: () => { st.pvTier = t; ctx.refresh(); } }, String(t)))),
        h('p', { class: 'hint' }, '시트에 그린 행보다 큰 단계는 마지막 행을 씁니다. 예: 한 행만 그렸으면 "0행만 사용", 3단계까지 그렸으면 "3행까지".'));
    })() : null;

    return [

          row(F.image(key, ['sprite', 'sheet'], { label: '스프라이트 시트', sub: PDM.assets.folderFor(key), rerender: true }), h('div', { class: 'field' }, h('span', { class: 'fl' }, ' '), quick)),
          c.sprite.armorRows === false ? h('p', { class: 'hint' }, `갑옷 단계 줄을 쓰지 않는 시트: 프레임 번호는 시트 전체 기준, 영웅은 갑옷 단계에 따라 줄이 바뀌지 않습니다. 게임 배율 0 = 자동(높이 15px).`) : null,
          row(F.num(key, ['sprite', 'frame', 0], { label: '프레임 가로(px)', int: true, min: 1, rerender: true }), F.num(key, ['sprite', 'frame', 1], { label: '프레임 세로(px)', int: true, min: 1, rerender: true }),
            F.num(key, ['sprite', 'scale'], { label: '게임 배율 (0=자동)', step: 0.05, min: 0 }),
            h('div', { class: 'field' }, h('span', { class: 'fl' }, ' '), h('button', { class: 'btn sm', onclick: async () => {
              let rel = c.sprite.sheet;
              if (!rel || rel.startsWith('game:')) {
                const dest = `assets/${PDM.assets.folderFor(key)}/${c.id}.png`;
                if (rel) { try { await pdm.copy(PDM.assets.resolvePath(rel), store.abs(dest)); } catch (e) { toast('복사 실패', 'bad'); return; } }
                rel = dest; store.edit(key, '시트 경로', o => { o.sprite.sheet = dest; }, { silent: true });
              }
              const out = await PDM.editPixelsModal('스프라이트 시트 편집 — ' + c.name, rel, c.sprite.frame[0] * 12, c.sprite.frame[1], c.sprite.frame[0], null, { rowStep: c.sprite.frame[1], light: key.startsWith('char:') ? { bloom: c.sprite.lightBloom || 0, onBloom: v => store.edit(key, '효과 레이어 번짐', o => { o.sprite.lightBloom = v; }, { silent: true }), mode: c.sprite.lightMode || 'add', onMode: m => store.edit(key, '효과 레이어 합성 방식', o => { o.sprite.lightMode = m; }, { silent: true }) } : null });
              if (out && out !== rel) { PDM.assets.invalidate(out); store.edit(key, '시트 경로 (다른 이름으로 저장)', o => { o.sprite.sheet = out; }); }   // 새 파일을 이 캐릭터의 시트로
              else if (out) ctx.refresh();
            } }, '시트 그리기/편집…'))),
          c.sprite.sheet ? h('div', { style: { margin: '2px 0 8px' } }, PDM.rescaleControl({ what: '스프라이트 시트',
            png: () => ((store.get(key) || {}).sprite || {}).sheet, cur: () => +(((store.get(key) || {}).sprite || {}).res) || 1,
            ensureOwn: async rel => { if (!/^(game|builtin):/.test(rel)) return rel; const dest = `assets/${PDM.assets.folderFor(key)}/${c.id}.png`; try { await pdm.copy(PDM.assets.resolvePath(rel), store.abs(dest)); return dest; } catch (e) { toast('게임 시트 복사 실패', 'bad'); return null; } },
            apply: (f, k, path) => store.edit(key, `스프라이트 배율 ×${k}`, o => { const sp = o.sprite, eff = PDM.charSpriteScale(sp); sp.sheet = path; sp.frame = [Math.max(1, Math.round(sp.frame[0] * f)), Math.max(1, Math.round(sp.frame[1] * f))]; sp.scale = +(eff / f).toFixed(5); sp.res = k; }) }),
            h('div', { class: 'hint' }, '프레임 크기와 게임 배율도 함께 바뀌어 게임에서의 크기는 그대로입니다 (효과 레이어 …_light.png 도 같이).')) : null,
          key.startsWith('char:') ? row(F.select(key, ['sprite', 'lightMode'], { add: '발광 (더하기)', screen: '스크린', overlay: '오버레이', dodge: '닷지 (색상 닷지)' }, { label: '✨ 효과 레이어 합성 방식', def: 'add' }),
            F.num(key, ['sprite', 'lightBloom'], { label: '번짐 반경 (px, 0 = 없음)', int: true, min: 0, max: 48, def: 0 }),
            F.num(key, ['sprite', 'lightBloomPower'], { label: '번짐 세기 (%)', int: true, min: 0, max: 300, def: 100 }),
            F.num(key, ['sprite', 'lightPower'], { label: '효과 레이어 세기 (%)', int: true, min: 0, max: 300, def: 100, hint: '"시트 그리기/편집"의 빛 레이어가 게임에서 더해지는 세기' }),
            F.num(key, ['sprite', 'lightPulse'], { label: '빛 깜빡임 주기 (초, 0 = 일정)', min: 0, step: 0.1, def: 0 }),
            F.num(key, ['sprite', 'lightPulseMin'], { label: '깜빡일 때 가장 어두운 세기 (%)', int: true, min: 0, max: 100, def: 40 })) : null,
          c.sprite.sheet ? sheetFitBox(key, c, isHero && c.sprite.armorRows !== false) : null,
          c.sprite.sheet ? sheetView(key, c, st) : h('div', { class: 'hint' }, '시트를 고르면 프레임 번호가 표시됩니다'),
          tierBox, h('h3', {}, '애니메이션'), animRows];
  }
  PDM.spriteEditor = spriteEditor;

  PDM.registerEditor({
    id: 'character', icon: k => { const c = store.get(k); return (c && KIND_ICON[c.kind]) || '☺'; },
    match: k => k.startsWith('char:'),
    title: k => { const c = store.get(k); return c ? c.name : k; },
    watch: (ck, tk) => ck === tk || ck === 'heart',
    tree() {
      if (!store.isOpen) return [];
      const all = store.all('char');
      const scan = PDM.GAME_SCAN, missing = c => !!(scan && c.game && scan.missingMob(c.game));
      // 게임 저장소에만 있는 몬스터 (묶여 있는 목록·프로젝트에 없는 클래스) — 누르면 프로젝트 캐릭터로 추가
      const fresh = ((scan && scan.newMobs) || []).filter(e => !all.some(c => c.game === e.cls));
      const addFresh = e => { const c = PDM.make.vanillaChar(Object.assign({}, e, { sprite: PDM.make.character('x', e.kind).sprite })); if (store.has('char:' + c.id)) { PDM.tabs.open('char:' + c.id); return; } c.note = '게임 저장소에서 새로 찾은 캐릭터 (actors.mobs.' + e.cls + ') — 그림·능력치는 게임 원래 것을 씁니다'; store.add('char:' + c.id, c, '게임 캐릭터 추가'); PDM.tabs.open('char:' + c.id); };
      return [{ id: 'char', label: '캐릭터', icon: '☺', order: 20, count: all.length,
        menu: Object.entries(PDM.CHAR_KINDS).map(([k, v]) => ({ label: `새 ${v}…`, run: () => newCharacter(k) })),
        children: Object.entries(PDM.CHAR_KINDS).map(([kind, label]) => {
          const list = all.filter(c => c.kind === kind);
          return { id: 'char_' + kind, label, icon: KIND_ICON[kind], count: list.length,
            menu: [{ label: `새 ${label}…`, run: () => newCharacter(kind) }],
            children: list.map(c => ({ id: 'c_' + c.id, label: c.name + ` (${c.id})` + (c.enabled === false ? ' (꺼짐)' : '') + (c.noSpawn ? ' — 등장 금지' : '') + (missing(c) ? ' — ⚠ 게임 저장소에 없음' : ''), icon: missing(c) ? '⚠' : c.noSpawn ? '⦸' : '', open: 'char:' + c.id, off: c.enabled === false,
              menu: [{ label: '열기', run: () => PDM.tabs.open('char:' + c.id) }, { label: '이름 바꾸기…', run: () => PDM.resOps.renameLabel('char', c.id) }, { label: 'id 바꾸기…', run: () => renameChar(c.id) }, { label: '복제', run: () => dupChar(c.id) }, { label: '쓰는 곳…', run: () => PDM.resOps.showUsage('char', c.id) }, PDM.resOps.useToggle('char', c), '-',
                c.game && ['mob', 'boss'].includes(c.kind) ? { label: c.noSpawn ? '다시 등장하게 (등장 금지 풀기)' : '등장하지 않게 (등장 금지)', run: () => store.edit('char:' + c.id, '등장 금지', o => { o.noSpawn = !o.noSpawn; }) } : null,
                { label: '삭제', run: async () => {
                  if (!c.game || !['mob', 'boss'].includes(c.kind)) { if (await PDM.ui.confirm(`「${c.name}」 캐릭터를 삭제할까요?`)) store.remove('char:' + c.id, '캐릭터 삭제'); return; }
                  // 원작 몬스터: 목록에서 지워도 게임 코드에는 남아 있으므로, 게임에서도 안 나오게 할지 물음
                  const r = await PDM.ui.modal('원작 캐릭터 삭제', h('div', {}, h('p', {}, `「${c.name}」 은(는) 게임에 원래 있는 몬스터입니다.`),
                    h('p', { class: 'hint' }, '목록에서만 지우면 게임에서는 계속 나옵니다. "삭제 + 등장 금지"를 고르면 던전에 자동으로 나오지 않게도 합니다 (프로젝트 설정 → 등장 금지 목록에서 되돌릴 수 있음).')),
                    [['취소', null], ['목록에서만 삭제', () => 'del'], ['삭제 + 등장 금지', () => 'ban', 'pri']]);
                  if (!r) return;
                  store.transaction('캐릭터 삭제', () => {
                    if (r === 'ban') store.edit('project', '등장 금지', p => { p.bannedMobs = [...new Set([...(p.bannedMobs || []), c.game])]; });
                    store.remove('char:' + c.id, '캐릭터 삭제');
                  });
                } }].filter(Boolean) })) };
        }).concat(fresh.length ? [{ id: 'char_fresh', label: '게임 저장소에서 새로 찾음', icon: '＋', count: fresh.length,
          children: fresh.map(e => ({ id: 'cf_' + e.cls, label: `${e.name} (${e.cls})`, icon: '＋', run: () => addFresh(e), menu: [{ label: '프로젝트 캐릭터로 추가', run: () => addFresh(e) }] })) }] : []) }];
    },
    render(key, ctx) {
      const c = store.get(key);
      const { F, section, row, listEditor } = PDM.ui;
      const sys = store.get('heart') || PDM.defaults.heart();
      const st = ctx.state = ctx.state || { anim: 'idle' };
      ctx.onDispose(() => ctx._stop && ctx._stop());

      const topics = [...new Set([...(sys.topics || []).map(t => t.key), ...Object.keys(c.dialogue || {})])];
      const dlg = h('div', {});
      topics.forEach(tk => {
        const t = (sys.topics || []).find(x => x.key === tk);
        const n = ((c.dialogue || {})[tk] || []).length;
        dlg.append(h('details', { open: n > 0 && tk === 'greet' },
          h('summary', { style: { cursor: 'pointer', padding: '4px 0' } }, h('b', {}, t ? t.name : tk), h('span', { class: 'hint' }, `  ${tk} · ${n}개`)),
          listEditor(key, ['dialogue', tk], {
            addLabel: '대사 추가', compact: true,
            make: () => ({ when: '', face: '', text: '' }),
            render: (it, i, p) => h('div', { class: 'dlg-line' },
              F.cond(key, [...p, 'when'], { placeholder: '조건 (비우면 기본)' }),
              F.ref(key, [...p, 'face'], 'face', { ctx: { char: c.id }, empty: '표정: 기본' }),
              F.textarea(key, [...p, 'text'], { rows: 2 }))
          })));
      });

      const behaviors = h('div', {});
      Object.entries(PDM.BEHAVIOR_HOOKS).forEach(([hk, label]) => {
        const n = ((c.behaviors || {})[hk] || []).length;
        behaviors.append(h('details', { open: n > 0 }, h('summary', { style: { cursor: 'pointer', padding: '4px 0' } }, h('b', {}, label), h('span', { class: 'hint' }, `  ${hk} · 명령 ${n}개`)),
          PDM.commandList(key, ['behaviors', hk], { defaultSpeaker: c.id })));
      });

      return h('div', { class: 'page' },
        h('h1', {}, `${KIND_ICON[c.kind] || ''} ${c.name}`, h('span', { class: 'hint ml-4' }, c.id)),
        c.game ? h('div', { class: 'banner', style: { border: '1px solid var(--line)', borderLeft: '3px solid var(--gold)', borderRadius: '6px', padding: '8px 10px', margin: '0 0 10px' } },
          h('div', {}, h('b', {}, '원작 캐릭터'), h('span', { class: 'hint mono ml-3' }, 'actors.mobs.' + c.game)),
          F.bool(key, ['useGame'], { label: '게임 원래 동작 그대로 쓰기 (AI·공격·특수 능력·퀘스트 모두 게임 코드) — 맵에 놓거나 이벤트로 소환하면 게임 클래스가 나옵니다', def: true, rerender: true }),
          h('p', { class: 'hint m-0 mt-2' }, c.useGame === false
            ? '끔: 아래 능력치·그림·AI·대사로 동작하는 PDMaker 캐릭터가 됩니다 (게임의 특수 능력은 없음).'
            : '켬: 아래 이름·능력치·그림은 참고용(편집기 미리보기)이고 게임에서는 원작 그대로입니다. 고쳐서 쓰려면 끄세요. 던전에 자동으로 나오는 몬스터는 이 설정과 관계없이 원작 그대로입니다.'),
          PDM.gameMobBox(c, st)) : null,
        section('기본',
          row(F.select(key, ['kind'], PDM.CHAR_KINDS, { label: '종류' }), F.text(key, ['name'], { label: '이름', rerender: true }), F.text(key, ['title'], { label: '칭호' }), F.bool(key, ['enabled'], { label: '사용 (게임에 나옴)', def: true, rerender: true })),
          c.enabled === false ? h('p', { class: 'hint c-warn' }, '꺼져 있음 — 맵에 놓은 것 · 몬스터 스폰 목록 · 이벤트 소환 · 동료 합류 · 이주 어디서도 나오지 않습니다 (원작 몬스터면 층의 몬스터 목록에서도 빠짐). 대사의 화자 이름 · 초상화는 그대로 씁니다.') : null,
          F.textarea(key, ['desc'], { label: '설명(도감)', rows: 2 })),
        section('스프라이트 · 애니메이션', ...spriteEditor(key, c, ctx, st)),
        !PDM.extensions.on('charPortrait') ? null : section('초상화 · 표정 · 대사창 일러스트',
          h('div', { class: 'dlg-prev-wrap' },
            (() => { const stg = h('div', { class: 'scene-prev dlg-stage dlg-mini', title: '대사창 미리보기 (대사창 편집기 설정)' });
              requestAnimationFrame(() => PDM.Dialogue && PDM.Dialogue.render(stg, PDM.Dialogue.line(c.id, st.pvFace || '', '', `${c.name}의 대사는 이렇게 보여요.`), { static: true }));
              return stg; })(),
            h('div', { class: 'dlg-prev-ctl' },
              F.image(key, ['portrait', 'default'], { label: '기본 초상화 / 스탠딩 일러스트', sub: PDM.assets.folderFor(key, 'portrait'), rerender: true }),
              row(F.num(key, ['portrait', 'scale'], { label: '크기 배율', step: 0.05, min: 0.1, def: 1, rerender: true }),
                F.num(key, ['portrait', 'offsetX'], { label: '안쪽으로 이동 (화면 높이 %)', step: 1, def: 0, rerender: true }),
                F.num(key, ['portrait', 'offsetY'], { label: '아래로 이동 (%)', step: 1, def: 0, rerender: true })),
              row(F.select(key, ['portrait', 'side'], { left: '왼쪽', right: '오른쪽' }, { label: '서는 쪽', empty: '대사창 설정대로', rerender: true }),
                F.bool(key, ['portrait', 'flip'], { label: '좌우 뒤집기', rerender: true })),
              F.sound(key, ['voice'], { label: '목소리 (대사 글자가 나올 때 소리 — 비우면 대사창 설정)', kind: 'se', allowNone: true, noneLabel: '(소리 없음)', empty: '(대사창 설정대로)' }),
              h('small', { class: 'hint' }, '투명 배경 PNG 를 쓰세요. 큰 그림(예: 세로 1000px)은 게임에서 부드럽게 줄여 보여 줍니다. 대사창 모양은 💬 대사창 편집기에서.'))),
          listEditor(key, ['portrait', 'expressions'], {
            addLabel: '표정 추가', compact: true, emptyText: '표정이 없습니다. 대사에서 표정을 쓰려면 추가하세요 (예: smile, angry, sad, shy)',
            make: () => ({ key: 'smile', image: '' }),
            render: (it, i, p) => row(F.text(key, [...p, 'key'], { label: '표정 키', transform: v => PDM.slugId(v) }), F.image(key, [...p, 'image'], { label: '이미지', sub: PDM.assets.folderFor(key, 'portrait') }),
              h('button', { class: 'btn sm', style: { flex: '0 0 auto', alignSelf: 'flex-end' }, onclick: e => { e.preventDefault(); st.pvFace = it.key; ctx.refresh(); } }, '미리보기'))
          })),
        section('소리',
          (() => {
            const S = (label, f, hint) => F.sound(key, ['sounds', f], { label, kind: 'se', allowNone: true, noneLabel: '(소리 없음)', empty: c.game && c.useGame !== false ? ({ attack: '(게임 소리: hit — Assets.Sounds.HIT)', hurt: '(게임: 소리 없음)', die: '(게임: 소리 없음 — 몬스터 코드에 따로 있으면 그 소리)', talk: '(게임: 소리 없음)' }[f] || '(게임 소리)') : ({ attack: '(기본: hit)', hurt: '(기본: 소리 없음)', die: '(기본: 소리 없음)', talk: '(기본: 소리 없음)' }[f] || '(기본)'), hint, rerender: true });
            const fighter = ['mob', 'boss'].includes(c.kind);
            return h('div', {},
              row(fighter ? S('공격할 때', 'attack', '공격이 맞을 때') : null, fighter ? S('다칠 때', 'hurt') : null, fighter ? S('쓰러질 때', 'die') : null, !fighter ? S('말 걸 때', 'talk', '영웅이 말을 걸 때') : null),
              PDM.extensions.on('charPortrait') ? h('p', { class: 'hint' }, '목소리(대사 글자 소리)는 위의 "초상화 · 표정" 칸에 있습니다. 🎚 로 사운드 편집기에서 편집합니다.') : null);
          })()),
        ['mob', 'boss'].includes(c.kind) ? section('등장 · 전리품',
          c.game ? F.bool(key, ['noSpawn'], { label: '던전에 자동으로 나오지 않게 (등장 금지) — 게임이 층마다 뽑는 몬스터 목록에서 뺍니다. 맵에 직접 놓거나 이벤트로 소환한 것은 그대로 나옵니다', rerender: true }) : null,
          F.bool(key, ['noGameLoot'], { label: '게임 코드의 전리품을 떨어뜨리지 않음 (아래 드랍 테이블만 적용)' }),
          c.game ? (() => { const el = h('p', { class: 'hint m-0 mt-1' }, '게임 코드의 전리품: 읽는 중…'); PDM.gameMobLoot(c.game).then(t => { el.textContent = '게임 코드의 전리품: ' + (t || '없음') + ' — 자세한 코드는 위 "게임 코드의 실제 값"'; }); return el; })() : h('p', { class: 'hint m-0 mt-1' }, '게임 클래스가 아닌 PDMaker 캐릭터라 게임 코드의 전리품은 없습니다.'),
          h('h4', { class: 'm-0 mt-5 mb-2' }, '드랍 테이블'),
          PDM.charLootEditor(key, c)) : null,
        ['npc', 'companion'].includes(c.kind) ? section('상인 기능 (사고파는 창)', shopEditor(key, c)) : null,
        section('능력치',
          row(F.num(key, ['stats', 'hp'], { label: '체력', min: 1, int: true }), F.num(key, ['stats', 'attackMin'], { label: '공격 최소', int: true }), F.num(key, ['stats', 'attackMax'], { label: '공격 최대', int: true })),
          row(F.num(key, ['stats', 'defense'], { label: '방어', int: true }), F.num(key, ['stats', 'accuracy'], { label: '명중', int: true }), F.num(key, ['stats', 'evasion'], { label: '회피', int: true }), F.num(key, ['stats', 'speed'], { label: '속도', step: 0.1 })),
          ['mob', 'boss'].includes(c.kind) ? h('div', {},
            h('div', { class: 'fl mt-3' }, '체력 (아이템 시험용 샌드백 등)'),
            row(F.bool(key, ['stats', 'infiniteHp'], { label: '체력 무한 — 피해 숫자는 뜨지만 체력이 줄지 않고 쓰러지지 않음', rerender: true }),
              F.num(key, ['stats', 'regen'], { label: '지속 회복량 (0 = 없음)', int: true, min: 0, def: 0, rerender: true }),
              (c.stats || {}).regen > 0 ? F.num(key, ['stats', 'regenEvery'], { label: '몇 턴마다', int: true, min: 1, def: 1 }) : null,
              (c.stats || {}).regen > 0 ? F.num(key, ['stats', 'regenDelay'], { label: '맞은 뒤 몇 턴 지나야 회복', int: true, min: 0, def: 0 }) : null),
            h('div', { class: 'btnbar' },
              h('button', { class: 'btn sm', title: '제자리에 고정 · 공격하지 않음 · 체력 무한', onclick: () => store.edit(key, '샌드백으로', o => { o.ai = o.ai || {}; o.ai.mode = 'fixed'; o.ai.fixedAttack = false; o.stats = o.stats || {}; o.stats.infiniteHp = true; }) }, '🎯 샌드백으로 (고정 · 체력 무한)'),
              h('span', { class: 'hint' }, '체력 무한이면 살펴보기 설명에 받은 피해(합계 · 횟수 · 평균 · 마지막)가 붙습니다 — 무기 · 마법봉 · 폭탄 피해를 재 보세요. 게임 캐릭터를 바탕으로 한 캐릭터에도 됩니다.'))) : null),
        section('AI · 경로',
          row(F.select(key, ['ai', 'mode'], PDM.AI_MODES, { label: '행동 방식', rerender: true }), ['patrol', 'schedule'].includes(c.ai.mode) ? F.num(key, ['ai', 'wait'], { label: '점마다 쉬는 턴', int: true, min: 0 }) : null,
            c.ai.mode === 'fixed' && ['mob', 'boss'].includes(c.kind) ? F.bool(key, ['ai', 'fixedAttack'], { label: '옆에 온 적은 공격 (끄면 가만히 맞기만 함)' }) : null),
          c.ai.mode === 'fixed' ? h('p', { class: 'hint' }, '그 자리에서 움직이지 않고, 밀치기(넉백) · 자리 바꾸기에도 밀려나지 않습니다.') : null,
          c.ai.mode === 'code' ? h('div', {},
            F.code(key, ['ai', 'code'], { sig: 'Boolean act(Mob self, MakerCharAI.Ctl ai, Hero hero, Level level) {   // 이 캐릭터의 차례마다', doc: PDM.codegen.CHARAI_DOC + ' 오류가 나면 원래 AI 로 움직이고 게임 안 경고로 알려 줍니다.', rows: 10, rerender: true }),
            F.code(key, ['ai', 'imports'], { label: 'import (한 줄에 하나 — 게임 actors · items · effects · mechanics 등은 이미 들어 있음)', rows: 2 }),
            h('div', { class: 'btnbar' },
              !String(c.ai.code || '').trim() ? h('button', { class: 'btn sm', onclick: () => store.edit(key, 'AI 코드 예시', o => { o.ai.code = PDM.codegen.CHARAI_SNIPPET; }) }, '예시 넣기 (거리 두며 싸움)') : null,
              h('button', { class: 'btn sm', onclick: () => PDM.ui.codeView('GenCharAI.java', PDM.codegen.charAISource(store.all('char'))) }, '생성될 코드 보기'),
              h('span', { class: 'hint' }, '경로 점이 필요하면 ai.cell(x, y) 로 칸을 만들어 ai.stepTo(…) 하세요.'))) : null,
          ['patrol', 'schedule'].includes(c.ai.mode) ? pathPicker(key, c) : null,
          ['patrol', 'schedule'].includes(c.ai.mode) ? listEditor(key, ['ai', 'path'], { addLabel: '점 추가', compact: true, make: () => ({ x: 1, y: 1 }),
            render: (it, i, p) => row(F.num(key, [...p, 'x'], { label: 'x', int: true, rerender: true }), F.num(key, [...p, 'y'], { label: 'y', int: true, rerender: true }), c.ai.mode === 'schedule' ? F.num(key, [...p, 'turn'], { label: '도착 턴(하루=1000)', int: true }) : h('span')) }) : null),
        !PDM.extensions.on('charHeart') ? null : section(PDM.T('sys.heart') + ' (era 방식)',
          F.bool(key, ['heart', 'enabled'], { label: '이 캐릭터에 마음 시스템 사용' }),
          c.heart.enabled ? h('div', {},
            h('div', { class: 'fl m-0 mt-3 mb-2' }, PDM.T('sys.trait')),
            F.chips(key, ['heart', 'traits'], (sys.traits || []).map(t => [t.key, t.name, `호감 ${t.favorAdd >= 0 ? '+' : ''}${t.favorAdd} / 신뢰 ${t.trustAdd >= 0 ? '+' : ''}${t.trustAdd}`])),
            row(F.list(key, ['heart', 'likes'], { label: '좋아하는 것', hint: '아이템 id 또는 tag:태그 (예: tag:herb)' }), F.list(key, ['heart', 'dislikes'], { label: '싫어하는 것' })),
            row(F.num(key, ['heart', 'initial', 'favor'], { label: '처음 ' + PDM.T('rel.favor'), int: true }), F.num(key, ['heart', 'initial', 'trust'], { label: '처음 ' + PDM.T('rel.trust'), int: true }))) : null),
        !PDM.extensions.on('charDialogue') ? null : section(PDM.T('sys.dialogue') + ' — 상황(토픽)별 대사',
          h('p', { class: 'hint' }, '조건이 맞는 대사 중 가장 구체적인(조건에 쓴 이름이 많은) 것을 고르고, 같으면 무작위입니다. 맞는 게 없으면 공용 대사를 씁니다.'),
          dlg, h('h3', {}, '대사 테스트'), dialogueTester(c)),
        !PDM.extensions.on('charBehavior') ? null : section('행동 이벤트 (GameMaker 식)', h('p', { class: 'hint' }, '상황마다 실행할 이벤트 명령. 비워 두면 기본 동작을 합니다.'), behaviors));
    }
  });
  PDM.characters = { newCharacter };
})();
