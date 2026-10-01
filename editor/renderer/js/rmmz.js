// ================================================================
//  RPG Maker MZ 리소스 가져오기
//   설치 폴더(예: …\RPG Maker MZ)의 newdata(기본 리소스)와 dlc\* (추가 팩)을 훑어서
//   소리(bgm·bgs·me·se, ogg)와 그림(characters·faces·enemies·sv_actors·pictures …)을 고르고
//   프로젝트 assets 로 복사합니다. 복사한 파일만 게임과 함께 쓰입니다.
//   ※ RPG Maker 리소스의 이용 조건(라이선스)은 사용자가 확인해야 합니다.
// ================================================================
PDM.rmmz = (function () {
  const store = PDM.store;
  const LS = 'pdmaker_rmmz_dir';
  const AUDIO_CATS = { bgm: '배경음 (BGM)', bgs: '환경음 (BGS)', me: '짧은 음악 (ME)', se: '효과음 (SE)' };
  const IMAGE_CATS = { characters: '캐릭터 (걷기 시트)', faces: '얼굴', enemies: '적', sv_actors: '사이드뷰 배우', sv_enemies: '사이드뷰 적', pictures: '그림',
    tilesets: '타일셋', parallaxes: '원경', battlebacks1: '전투 배경1', battlebacks2: '전투 배경2', titles1: '타이틀1', titles2: '타이틀2', system: '시스템' };
  const CAT_ALIAS = { face: 'faces' };
  let cache = null, cacheDir = '';

  function remembered() { try { return localStorage.getItem(LS) || ''; } catch (_) { return ''; } }
  function remember(d) { try { localStorage.setItem(LS, d); } catch (_) { /* 저장 불가 */ } }
  /** 설치 폴더: 프로젝트 설정 → 마지막으로 쓴 곳 → 프로젝트 위쪽 폴더들에서 "RPG Maker MZ" 찾기 */
  async function dir() {
    const p = (store.get('project') || {}).rpgMakerDir;
    const cands = [];
    if (p) cands.push(store.abs(p));
    const r = remembered(); if (r) cands.push(r);
    let up = store.root;
    for (let i = 0; i < 4 && up; i++) { up = pdm.dirname(up); cands.push(pdm.join(up, 'RPG Maker MZ')); }
    for (const c of cands) if (c && await pdm.exists(pdm.join(c, 'newdata'))) return c;
    return null;
  }
  async function walk(base, rel, depth, out) {
    let list = [];
    try { list = await pdm.list(pdm.join(base, rel)); } catch (_) { return; }
    for (const e of list) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.dir) { if (depth < 5) await walk(base, r, depth + 1, out); }
      else out.push(r);
    }
  }
  function classify(rel) {
    const segs = rel.toLowerCase().split('/'), ext = (segs[segs.length - 1].split('.').pop() || '');
    if (ext === 'ogg') { const c = segs.find(s => AUDIO_CATS[s]); return c ? { type: 'audio', cat: c } : null; }
    if (ext === 'png') { const c = segs.map(s => CAT_ALIAS[s] || s).find(s => IMAGE_CATS[s]); return c ? { type: 'image', cat: c } : null; }
    return null;
  }
  /** 전체 목록 [{pack, type, cat, name, path}] */
  async function scan(force) {
    const d = await dir();
    if (!d) return null;
    if (cache && cacheDir === d && !force) return cache;
    const items = [];
    const packs = [{ name: '기본 (newdata)', base: pdm.join(d, 'newdata') }];
    try { for (const e of await pdm.list(pdm.join(d, 'dlc'))) if (e.dir) packs.push({ name: e.name, base: pdm.join(d, 'dlc', e.name) }); } catch (_) { /* dlc 없음 */ }
    for (const pk of packs) {
      const files = []; await walk(pk.base, '', 0, files);
      files.forEach(rel => { const c = classify(rel); if (c) items.push({ pack: pk.name, type: c.type, cat: c.cat, name: rel.split('/').pop(), rel, path: pdm.join(pk.base, rel) }); });
    }
    cache = items; cacheDir = d;
    return items;
  }
  const safeName = n => n.replace(/[^A-Za-z0-9_.\-$!]/g, '_');
  /** 프로젝트로 복사 → 프로젝트 기준 경로 */
  async function importItem(it) {
    const sub = it.type === 'audio' ? `assets/audio/rmmz/${it.cat}` : `assets/rmmz/${it.cat}`;
    const rel = `${sub}/${safeName(it.name)}`;
    if (!(await pdm.exists(store.abs(rel)))) await pdm.copy(it.path, store.abs(rel));
    return rel;
  }

  /** 고르기 창.  o.type: 'audio' | 'image',  o.cat: 처음 보일 분류,  → 고른 항목 (없으면 null) */
  async function browse(o = {}) {
    const { h } = PDM;
    let d = await dir();
    if (!d) {
      const picked = await pdm.openFolder('RPG Maker MZ 설치 폴더 (newdata 가 들어 있는 폴더)');
      if (!picked) return null;
      if (!(await pdm.exists(pdm.join(picked, 'newdata')))) { toast('newdata 폴더가 없습니다. RPG Maker MZ 설치 폴더를 고르세요', 'bad'); return null; }
      remember(picked); d = picked;
    }
    const wait = h('div', { class: 'hint' }, 'RPG Maker MZ 리소스를 읽는 중…');
    const body = h('div', { class: 'rm-browse' }, wait);
    let chosen = null;
    const done = PDM.ui.modal('RPG Maker MZ 리소스', body, [['취소', null], ['가져오기', () => chosen, 'pri']]);
    const items = await scan();
    if (!items) { wait.textContent = '폴더를 읽지 못했습니다: ' + d; return done; }
    const cats = o.type === 'audio' ? AUDIO_CATS : o.type === 'image' ? IMAGE_CATS : Object.assign({}, AUDIO_CATS, IMAGE_CATS);
    const st = { cat: o.cat && cats[o.cat] ? o.cat : Object.keys(cats).find(c => items.some(i => i.cat === c)) || Object.keys(cats)[0], q: '', pack: '' };
    const packs = [...new Set(items.map(i => i.pack))];
    const list = h('div', { class: 'rm-list' }), info = h('div', { class: 'rm-info' });
    const q = h('input', { type: 'text', placeholder: '이름 검색', oninput: () => { st.q = q.value.toLowerCase(); draw(); } });
    const ps = h('select', { onchange: () => { st.pack = ps.value; draw(); } }, h('option', { value: '' }, '모든 팩'), packs.map(p => h('option', { value: p }, p)));
    const tabs = h('div', { class: 'code-tabs' });
    const drawTabs = () => { tabs.innerHTML = ''; Object.entries(cats).forEach(([k, v]) => { const n = items.filter(i => i.cat === k).length; if (!n) return; tabs.append(h('button', { class: 'btn xs' + (st.cat === k ? ' on' : ''), onclick: () => { st.cat = k; drawTabs(); draw(); } }, `${v} ${n}`)); }); };
    const thumbs = new Map();
    const thumb = it => {
      const cv = h('canvas', { width: 96, height: 64 });
      pdm.readDataURL(it.path).then(u => { const im = new Image(); im.onload = () => { const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; const sc = Math.min(96 / im.width, 64 / im.height, 2); g.drawImage(im, (96 - im.width * sc) / 2, (64 - im.height * sc) / 2, im.width * sc, im.height * sc); thumbs.set(it.path, im); }; im.src = u; }).catch(() => { /* 무시 */ });
      return cv;
    };
    const draw = () => {
      list.innerHTML = '';
      const shown = items.filter(i => i.cat === st.cat && (!st.pack || i.pack === st.pack) && (!st.q || i.name.toLowerCase().includes(st.q))).slice(0, 400);
      shown.forEach(it => {
        const row = h('div', { class: 'rm-item' + (chosen === it ? ' on' : ''), onclick: () => { chosen = it; draw(); showInfo(it); } },
          it.type === 'image' ? thumb(it) : h('button', { class: 'ib', onclick: e => { e.stopPropagation(); playFile(it); } }, '▶'),
          h('div', {}, h('b', {}, it.name.replace(/\.[^.]+$/, '')), h('div', { class: 'hint' }, it.pack)));
        list.append(row);
      });
      if (!shown.length) list.append(h('div', { class: 'empty' }, '없음'));
    };
    const playFile = async it => { try { PDM.audio.invalidate(it.path); const b = await PDM.audio.bufferOfPath(it.path); PDM.audio.playBuffer(b, { volume: 0.9 }); } catch (e) { toast('재생 실패: ' + e.message, 'bad'); } };
    const showInfo = it => {
      info.innerHTML = '';
      info.append(h('b', {}, it.name), h('div', { class: 'hint mono' }, it.rel));
      if (it.type === 'audio') info.append(h('div', { style: { display: 'flex', gap: '4px', marginTop: '6px' } }, h('button', { class: 'btn sm pri', onclick: () => playFile(it) }, '▶ 듣기'), h('button', { class: 'btn sm', onclick: () => PDM.audio.stop() }, '■')));
      else { const cv = h('canvas', { style: { maxWidth: '100%', imageRendering: 'pixelated', marginTop: '6px', background: '#000' } }); pdm.readDataURL(it.path).then(u => { const im = new Image(); im.onload = () => { cv.width = im.width; cv.height = im.height; cv.getContext('2d').drawImage(im, 0, 0); }; im.src = u; }); info.append(cv); }
    };
    body.innerHTML = '';
    body.append(
      h('p', { class: 'hint' }, `폴더: ${d} · 고른 파일은 프로젝트 assets 로 복사됩니다. ⚠ RPG Maker MZ 리소스를 다른 엔진의 게임에서 쓰거나 배포해도 되는지는 RPG Maker 이용 약관과 각 팩의 조건을 꼭 확인하세요.`),
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' } }, q, ps,
        h('button', { class: 'btn sm', onclick: async () => { const p = await pdm.openFolder('RPG Maker MZ 설치 폴더'); if (p) { remember(p); cache = null; toast('폴더를 바꿨습니다. 창을 다시 열어 주세요'); } } }, '폴더 바꾸기')),
      tabs, h('div', { class: 'rm-wrap' }, list, info));
    drawTabs(); draw();
    const r = await done;
    PDM.audio.stop();
    return r;
  }

  /** 소리 가져오기 → 사운드 목록에 등록하고 참조(sound:id) 를 돌려줌 */
  async function importSound(cat) {
    const it = await browse({ type: 'audio', cat });
    if (!it) return null;
    const rel = await importItem(it);
    const base = it.name.replace(/\.[^.]+$/, '');
    const sounds = ((store.get('sounds') || {}).sounds) || [];
    let e = sounds.find(s => s.file === rel);
    if (!e) {
      let id = PDM.slugId('rm_' + base) || 'rm_sound', n = 2; const b = id;
      while (sounds.some(s => s.id === id)) id = b + '_' + (n++);
      e = { id, name: base, kind: it.cat === 'bgm' || it.cat === 'bgs' ? 'bgm' : 'se', file: rel, volume: 1, pitch: 1, loop: it.cat === 'bgm' || it.cat === 'bgs', note: `RPG Maker MZ ${AUDIO_CATS[it.cat]} · ${it.pack}` };
      store.edit('sounds', 'RPG Maker 소리 가져오기', r => { r.sounds = r.sounds || []; r.sounds.push(e); });
    }
    toast(`「${e.name}」 가져옴`);
    return 'sound:' + e.id;
  }
  /** 그림 가져오기 → 프로젝트 경로 */
  async function importImage(cat) {
    const it = await browse({ type: 'image', cat });
    if (!it) return null;
    return importItem(it);
  }

  /** RPG Maker 걷기 시트 → 스프라이트 설정. 시트 한 장에 8명(4×2)이면 고르고, $ 로 시작하면 1명. 오른쪽 보는 줄을 씀 */
  async function characterSprite() {
    const it = await browse({ type: 'image', cat: 'characters' });
    if (!it) return null;
    const url = await pdm.readDataURL(it.path);
    const im = await new Promise(res => { const x = new Image(); x.onload = () => res(x); x.src = url; });
    const single = it.name.startsWith('$') || it.name.startsWith('!$');
    const cols = 12, rows = 8;
    const fw = single ? im.width / 3 : im.width / cols, fh = single ? im.height / 4 : im.height / rows;
    let idx = 0;
    if (!single) {
      const { h } = PDM;
      const cv = h('canvas', { width: im.width, height: im.height, style: { cursor: 'pointer', imageRendering: 'pixelated', maxWidth: '100%' } });
      const g = cv.getContext('2d');
      const draw = () => { g.clearRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0); g.strokeStyle = '#ffde59'; g.lineWidth = 3; g.strokeRect((idx % 4) * fw * 3 + 1.5, Math.floor(idx / 4) * fh * 4 + 1.5, fw * 3 - 3, fh * 4 - 3); };
      cv.onclick = e => { const b = cv.getBoundingClientRect(); const x = (e.clientX - b.left) * cv.width / b.width, y = (e.clientY - b.top) * cv.height / b.height; idx = Math.floor(y / (fh * 4)) * 4 + Math.floor(x / (fw * 3)); draw(); };
      draw();
      const ok = await PDM.ui.modal('캐릭터 고르기 — ' + it.name, h('div', {}, h('p', { class: 'hint' }, '시트 한 장에 8명이 있습니다. 쓸 캐릭터를 누르세요.'), cv), [['취소', null], ['이 캐릭터', true, 'pri']]);
      if (!ok) return null;
    }
    const rel = await importItem(it);
    const perRow = single ? 3 : cols;
    const c0 = single ? 0 : (idx % 4) * 3, r0 = single ? 0 : Math.floor(idx / 4) * 4;
    const at = (r, c) => (r0 + r) * perRow + c0 + c;   // r: 0 아래 · 1 왼쪽 · 2 오른쪽 · 3 위
    const right = [at(2, 0), at(2, 1), at(2, 2)], down = [at(0, 0), at(0, 1), at(0, 2)];
    return {
      sheet: rel, frame: [Math.round(fw), Math.round(fh)], scale: 0, armorRows: false,
      anims: {
        idle: { frames: [down[1], down[1], down[1], down[0], down[1], down[1], down[2], down[1]], fps: 3, loop: true },
        run: { frames: [right[0], right[1], right[2], right[1]], fps: 10, loop: true },
        attack: { frames: [right[1], right[2], right[2], right[1]], fps: 14, loop: false },
        zap: { frames: [down[1], right[1], right[2], right[1]], fps: 12, loop: false },
        operate: { frames: [down[0], down[2], down[0], down[2]], fps: 8, loop: false },
        die: { frames: [down[1], at(1, 1), at(3, 1), right[1]], fps: 8, loop: false }
      },
      rmmz: { file: it.rel, pack: it.pack, index: idx }
    };
  }

  return { dir, scan, browse, importItem, importSound, importImage, characterSprite, AUDIO_CATS, IMAGE_CATS };
})();
