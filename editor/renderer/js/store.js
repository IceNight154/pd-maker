// ================================================================
//  store — 열려 있는 프로젝트 전체 + 실행 취소/다시 실행 + 저장
//
//  리소스 키 → 파일
//    project        → project.json
//    terms          → terms.json
//    world          → maps/world.json      (맵 그래프: 그룹 · 노드 위치 · 연결)
//    story          → story/story.json
//    heart          → heart/heart.json
//    title          → title.json          (타이틀 화면)
//    dialogue       → dialogue.json       (대사창)
//    theme          → theme.json          (게임 UI 테마 — 6차, 없으면 예전 모습 · 고칠 때만 파일을 만듦)
//    node:<id>      → maps/nodes/<id>.json (노드 한 개의 맵)
//    room:<id>      → rooms/<id>.json
//    char:<id>      → characters/<id>.json
//    item:<id>      → items/<id>.json
//    event:<id>     → events/<id>.json
//
//  편집은 반드시 store.edit(key, '설명', r => { ...r 를 고침... }) 으로 합니다.
// ================================================================
PDM.store = (function () {
  const em = PDM.Emitter();
  const SINGLES = { project: 'project.json', terms: 'terms.json', world: 'maps/world.json', story: 'story/story.json', heart: 'heart/heart.json', sounds: 'audio/sounds.json', title: 'title.json', dialogue: 'dialogue.json', theme: 'theme.json', gameitems: 'gameitems.json', textfx: 'textfx.json', effects: 'effects.json', texts: 'texts.json', compose: 'compose.json', filters: 'filters.json', trailers: 'trailers.json', badges: 'badges.json', quests: 'quests.json', motion: 'motion.json', tilecombos: 'maps/tilecombos.json' };
  const PREFIX = { node: 'maps/nodes', room: 'rooms', char: 'characters', hero: 'heroes', item: 'items', event: 'events', prop: 'props' };
  let version = 0;           // 바뀔 때마다 +1 (계산 캐시용)

  let root = null;            // 프로젝트 폴더 경로
  let data = {};              // key → 객체
  let dirty = new Set();      // 저장 안 된 키
  let removed = new Set();    // 저장할 때 지울 파일 키
  let backup = new Map();     // 덮어쓰거나 지우기 전에 원본을 백업할 키 → 이유 (변환 · 손상 · 삭제) — 처음 한 번만
  let backupDir = '';         // 이번에 연 프로젝트의 백업 폴더 (.pdmaker-backup/<시각>) — 처음 백업할 때 정함
  let undoStack = [], redoStack = [];
  const UNDO_MAX = 200;
  const BACKUP = '.pdmaker-backup', BACKUP_KEEP = 20;   // 백업 폴더 (게임 · 내보내기에는 들어가지 않음 — main.js skipProj) · 남길 개수

  function fileOf(key) {
    if (SINGLES[key]) return pdm.join(root, SINGLES[key]);
    const [type, id] = key.split(':');
    // 예전 형식 파일 (변환 후 지울 때만 씀)
    if (type === 'legacyfloor') return pdm.join(root, 'maps', `floor_${String(id).padStart(2, '0')}.json`);
    if (type === 'legacyextra') return pdm.join(root, 'maps', `extra_${id}.json`);
    if (type === 'legacychapters') return pdm.join(root, 'maps', 'chapters.json');
    return pdm.join(root, PREFIX[type], id + '.json');
  }
  function keysOf(type) {
    return Object.keys(data).filter(k => k.startsWith(type + ':')).sort((a, b) => {
      return a.localeCompare(b);
    });
  }

  async function readJSON(p) { return JSON.parse(await pdm.readText(p)); }

  /** 불러올 때 고친(변환한) 키: 저장 대상 + 저장하기 전에 원본 백업 */
  function migrated(key, why) { dirty.add(key); if (!backup.has(key)) backup.set(key, why || '변환'); }

  let missing = new Set();   // 열 때 파일이 없어 기본값으로 채운 한 파일짜리 리소스 (저장하면 지움) — 6차: 게임 UI 테마 화면 안내
  async function load(dir) {
    missing = new Set();
    root = dir; data = {}; dirty = new Set(); removed = new Set(); backup = new Map(); backupDir = ''; undoStack = []; redoStack = [];
    const problems = [];
    let legacy = null;
    for (const [key, rel] of Object.entries(SINGLES)) {
      const p = pdm.join(dir, rel);
      const there = await pdm.exists(p);
      if (key === 'world' && !there && (await pdm.exists(pdm.join(dir, 'maps', 'chapters.json')))) { legacy = true; continue; }
      if (!there) {   // 없는 파일 → 기본값 (예전 프로젝트에 나중에 생긴 파일들)
        if (key === 'project') throw new Error('project.json 이 없습니다. 프로젝트 폴더가 맞나요?\n' + p);
        if (key === 'world') { const dw = PDM.World.defaultWorld(); data.world = dw.world; Object.entries(dw.data).forEach(([id, o]) => { data['node:' + id] = o; dirty.add('node:' + id); }); }
        else data[key] = PDM.defaults[key]();
        missing.add(key);
        if (key !== 'tilecombos' && key !== 'theme') dirty.add(key);   // 조합 타일(확장 기능) · 게임 UI 테마(6차 — 예전 프로젝트의 모습이 바뀌지 않게)는 쓸 때만 파일을 만듦
        if (key !== 'title' && key !== 'dialogue' && key !== 'theme' && key !== 'gameitems' && key !== 'textfx' && key !== 'effects' && key !== 'texts' && key !== 'compose' && key !== 'filters' && key !== 'trailers' && key !== 'badges' && key !== 'quests' && key !== 'motion' && key !== 'tilecombos') problems.push(`${rel} 이(가) 없어서 기본값으로 만들었습니다`);
        continue;
      }
      try { data[key] = await readJSON(p); }
      catch (e) {
        // 있는데 읽지 못함(손상 · 쓰다 만 파일) → 기본값으로 열되 파일은 덮어쓰지 않음.
        // 이 리소스를 고쳐서 저장하면 그때 원본을 백업 폴더에 먼저 옮겨 둠 (손으로 고쳐 살릴 수 있게)
        if (key === 'project') throw new Error('project.json 을 읽지 못했습니다 (파일이 손상됨). 프로젝트 폴더가 맞나요?\n' + e.message);
        data[key] = key === 'world' ? PDM.World.defaultWorld().world : PDM.defaults[key]();   // 기본 노드는 만들지 않음 — maps/nodes/ 의 파일을 그대로 읽음
        backup.set(key, '손상');
        problems.push(`${rel} 이(가) 손상되어 읽지 못했습니다 (${e.message}). 기본값으로 열었고 파일은 그대로 둡니다 — 이 항목을 고쳐 저장하면 원본은 ${BACKUP}/ 에 보관됩니다`);
      }
    }
    // 조합 타일: 예전 이름 combos → list (런타임은 둘 다 읽음)
    if (data.tilecombos && Array.isArray(data.tilecombos.combos) && !Array.isArray(data.tilecombos.list)) { data.tilecombos.list = data.tilecombos.combos; delete data.tilecombos.combos; migrated('tilecombos'); }
    if (data.tilecombos) { data.tilecombos.list = data.tilecombos.list || []; data.tilecombos.legacy = data.tilecombos.legacy || []; }
    // 마음의 보석 → 마음의 결정 (예전 heart.json / terms.json)
    if (data.heart && PDM.Heart && PDM.Heart.migrate(data.heart)) { migrated('heart'); problems.push('마음의 보석을 "마음의 결정"으로 바꿨습니다 (저장하면 적용)'); }
    if (data.terms && data.terms.terms) {
      const t = data.terms.terms; let ch = false;
      Object.keys(t).forEach(k => { if (k.startsWith('gem.') || k === 'sys.gem') { delete t[k]; ch = true; } });
      if (ch) migrated('terms');
    }
    for (const [type, folder] of Object.entries(PREFIX)) {
      let list = [];
      try { list = await pdm.list(pdm.join(dir, folder)); } catch (_) { list = []; }
      for (const f of list) {
        if (f.dir || !f.name.endsWith('.json')) continue;
        try {
          const obj = await readJSON(pdm.join(dir, folder, f.name));
          const id = obj.id || f.name.replace(/\.json$/, '');
          obj.id = obj.id || id;
          const before = JSON.stringify(obj);
          data[`${type}:${id}`] = PDM.migrate(type, obj);
          if (type === 'hero' && JSON.stringify(obj) !== before) { migrated(`hero:${id}`); problems.push(`영웅 ${id}: 예전 스킬을 새 구조(주문·주문서)로 바꿨습니다 (저장하면 적용)`); }
          if ((type === 'node' || type === 'room') && PDM.migrateMapData) { const ch = PDM.migrateMapData(obj); if (ch.length) { migrated(`${type}:${id}`); problems.push(`${type === 'node' ? '맵' : '방 템플릿'} ${id}: ${ch.join(' · ')} (저장하면 적용)`); } }
        } catch (e) { backup.set(`${type}:${f.name.replace(/\.json$/, '')}`, '손상'); problems.push(`${folder}/${f.name}: 읽지 못했습니다 (${e.message}) — 이 파일은 불러오지 않고 그대로 둡니다`); }
      }
    }
 // 예전 형식 맵(5층 단위 장 + floor_XX + extra_*) → 맵 그래프
    if (legacy) {
      const chapters = await readJSON(pdm.join(dir, 'maps', 'chapters.json'));
      const floors = {}, extras = [];
      let list = []; try { list = await pdm.list(pdm.join(dir, 'maps')); } catch (_) { list = []; }
      for (const f of list) {
        let m = f.name.match(/^floor_(\d+)\.json$/);
        if (m) { floors[+m[1]] = await readJSON(pdm.join(dir, 'maps', f.name)); removed.add('legacyfloor:' + (+m[1])); continue; }
        m = f.name.match(/^extra_(.+)\.json$/);
        if (m) { const e = await readJSON(pdm.join(dir, 'maps', f.name)); e.id = e.id || m[1]; extras.push(e); removed.add('legacyextra:' + m[1]); }
      }
      removed.add('legacychapters:x');
      const r = PDM.World.fromLegacy(chapters, floors, extras);
      data.world = r.world; dirty.add('world');
      Object.entries(r.data).forEach(([id, obj]) => { data['node:' + id] = obj; dirty.add('node:' + id); });
      // 이벤트의 층 이동 · NPC 경로 층 · 시작 층
      const nodeOf = (depth, extra) => extra ? extra : (r.data['f' + depth] ? 'f' + depth : '');
      const fixCmds = list => (list || []).forEach(c => {
        if (c.cmd === 'transfer' && !c.node) { c.node = nodeOf(c.depth, c.extra); delete c.depth; delete c.extra; }
        ['then', 'else', 'body'].forEach(k => fixCmds(c[k])); (c.branches || []).forEach(fixCmds);
      });
      Object.keys(data).filter(k => k.startsWith('event:')).forEach(k => { (data[k].pages || []).forEach(p => fixCmds(p.commands)); dirty.add(k); });
      Object.keys(data).filter(k => k.startsWith('char:')).forEach(k => {
        const c = data[k]; Object.values(c.behaviors || {}).forEach(fixCmds);
        if (c.ai && c.ai.pathDepth) { c.ai.pathNode = 'f' + c.ai.pathDepth; delete c.ai.pathDepth; }
        dirty.add(k);
      });
      Object.keys(data).filter(k => k.startsWith('item:')).forEach(k => fixCmds(data[k].onUse));
      if (data.story) { (data.story.beats || []).forEach(b => { if (!b.node) { b.node = nodeOf(b.floor); delete b.floor; delete b.chapter; } }); dirty.add('story'); }
      if (data.project && data.project.startDepth > 1 && r.data['f' + data.project.startDepth]) data.world.start = 'f' + data.project.startDepth;
      // 바뀌는 리소스 · 지워질 예전 파일은 저장하기 전에 원본을 백업
      [...dirty, ...removed].forEach(k => { if (!backup.has(k)) backup.set(k, '변환'); });
      problems.push('예전 형식(5층 단위 장)의 맵을 노드 그래프(maps/world.json + maps/nodes/)로 바꿨습니다. 저장하면 예전 파일(chapters.json, floor_XX, extra_*)은 지워집니다.', ...r.notes);
    }
    // 새 형식인데 예전 파일이 남아 있으면 저장할 때 정리
    if (!legacy && data.world) {
      let list = []; try { list = await pdm.list(pdm.join(dir, 'maps')); } catch (_) { list = []; }
      let n = 0;
      for (const f of list) {
        let m = f.name.match(/^floor_(\d+)\.json$/); if (m) { removed.add('legacyfloor:' + (+m[1])); n++; continue; }
        m = f.name.match(/^extra_(.+)\.json$/); if (m) { removed.add('legacyextra:' + m[1]); n++; continue; }
        if (f.name === 'chapters.json') { removed.add('legacychapters:x'); n++; }
      }
      if (n) problems.push(`maps/ 에 예전 형식 파일 ${n}개(chapters.json, floor_XX, extra_*)가 남아 있습니다. 쓰이지 않으므로 저장할 때 지웁니다.`);
    }
    // 예전 형식: 캐릭터 종류 "영웅" → 영웅 편집기(heroes/)로 옮김
    for (const k of Object.keys(data).filter(k => k.startsWith('char:'))) {
      const c = data[k];
      if (c.kind !== 'hero') continue;
      const hk = 'hero:' + c.id;
      if (!data[hk]) {
        const hr = PDM.make.hero(c.id);
        Object.assign(hr, { name: c.name, title: c.title || '', desc: c.desc || '', character: c.id, sprite: PDM.clone(c.sprite || hr.sprite) });
        hr.stats.hp = (c.stats && c.stats.hp) || 20;
        hr.inventory.items = ((c.hero || {}).startItems || []).map(x => ({ item: x.item, count: x.count || 1, level: 0, equip: false, quickslot: false, identify: true }));
        data[hk] = hr; dirty.add(hk);
      }
      c.kind = 'npc'; delete c.hero; migrated(k);
      problems.push(`캐릭터 「${c.name}」 의 영웅 설정을 영웅 편집기(heroes/${c.id}.json)로 옮겼습니다. 저장하면 반영됩니다.`);
    }
    version++;
    em.emit('load');
    return problems;
  }

  /** 덮어쓰거나 지우기 전에 원본 파일을 .pdmaker-backup/<시각>/<같은 경로> 로 복사 (없는 파일은 건너뜀) */
  async function backupFile(key) {
    const p = fileOf(key);
    if (!(await pdm.exists(p))) return;
    if (!backupDir) {
      const d = new Date(), z = n => String(n).padStart(2, '0');
      backupDir = pdm.join(root, BACKUP, `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`);
      await pruneBackups();
    }
    await pdm.copy(p, pdm.join(backupDir, pdm.relative(root, p)));
  }
  /** 오래된 백업 폴더 정리 (최근 BACKUP_KEEP 개만 남김) */
  async function pruneBackups() {
    try {
      const all = (await pdm.list(pdm.join(root, BACKUP))).filter(f => f.dir && /^\d{8}-\d{6}$/.test(f.name)).map(f => f.name).sort();
      for (const n of all.slice(0, Math.max(0, all.length - BACKUP_KEEP + 1))) await pdm.remove(pdm.join(root, BACKUP, n));
    } catch (_) { /* 정리 실패는 저장을 막지 않음 */ }
  }

  /** 저장 순서: ① 덮어쓸 변환 · 손상 원본과 지울 파일을 백업 ② 바뀐 파일 쓰기 ③ 다 쓴 뒤에 지울 파일 지우기
   *  중간에 실패하면 예외 — 아직 못 쓴 키 · 못 지운 파일은 그대로 남아 다시 저장할 수 있음 (먼저 지워서 데이터를 잃는 일이 없게) */
  async function save() {
    if (!root) throw new Error('열린 프로젝트가 없습니다');
    const saved = [];
    for (const key of [...dirty].filter(k => backup.has(k) && data[k]).concat([...removed])) {
      try { await backupFile(key); }
      catch (e) { throw new Error(`원본 백업 실패 (${pdm.relative(root, fileOf(key))}): ${e.message} — 저장하지 않았습니다`); }
      backup.delete(key);
    }
    for (const key of [...dirty]) {
      if (data[key]) {
        try { await pdm.writeText(fileOf(key), JSON.stringify(data[key], null, 2) + '\n'); }
        catch (e) { em.emit('dirty'); throw new Error(`${pdm.relative(root, fileOf(key))} 저장 실패: ${e.message}${saved.length ? ` (먼저 ${saved.length}개는 저장됨)` : ''}`); }
        saved.push(key); missing.delete(key);
      }
      dirty.delete(key);
    }
    for (const key of [...removed]) {
      try { await pdm.remove(fileOf(key)); } catch (_) { /* 이미 없음 */ }
      removed.delete(key);
    }
    em.emit('saved', saved);
    em.emit('dirty');
    return saved;
  }

  /** 새 프로젝트: 샘플 폴더의 파일을 전부 복사하거나, 빈 기본값으로 만듭니다 */
  async function createNew(dir, name) {
    missing = new Set();
    root = dir; data = {}; dirty = new Set(); removed = new Set(); backup = new Map(); backupDir = ''; undoStack = []; redoStack = [];
    for (const key of Object.keys(SINGLES)) data[key] = PDM.defaults[key]();
    data.project.name = name || data.project.name;
    // 새 프로젝트는 원작 게임처럼: 원작 가운데 대사창, 마음 창 버튼 없음 (필요하면 켜면 됨)
    data.project.heartButton = false;
    if (data.dialogue) data.dialogue = Object.assign(PDM.defaults.dialogue({ themed: true }), { mode: 'window' });   // 6차: 대사창 색 · 모양은 게임 UI 테마를 따름 (빈 칸)
    data.project.cutsceneSpeed = true;   // 6차: 연출 중 배속 표시줄 (내보낸 게임에도 — 프로젝트 설정에서 끌 수 있음)
    if (data.title) data.title.enabled = false;      // 타이틀 화면: 게임 원래 그대로 (켜면 꾸미기)
    // 게임 저장소: PDMaker 폴더 안 game/shattered-pixel-dungeon-master (원작 기준)
    try { const P = await pdm.paths(); if (P && P.gameRepo) data.project.gameRepo = pdm.relative(dir, P.gameRepo).replace(/\\/g, '/'); } catch (_) { /* 무시 */ }
    const dw = PDM.World.defaultWorld();
    data.world = dw.world;
    Object.entries(dw.data).forEach(([id, obj]) => { data['node:' + id] = obj; });
    // 원작과 같은 영웅 6명 · 몬스터 · 보스 · NPC (게임 원래 동작을 그대로 쓰는 항목으로)
    if (PDM.make.vanilla) Object.assign(data, PDM.make.vanilla());
    // 영웅 선택 화면 순서: 원작 순서 (전사·마법사·도적·사냥꾼·결투가·성직자)
    data.project.heroOrder = (PDM.SPD_HEROES || []).map(x => x.cls.toLowerCase()).filter(id => data['hero:' + id]);
    // 확장 기능(이벤트·시스템)은 꺼진 채로 시작 — 도구 모음의 "확장 기능"에서 켬
    data.project.extensions = {};   // 확장 기능은 모두 꺼진 채로 시작 — 도구 모음의 "확장 기능"에서 켬
    Object.keys(data).forEach(k => { if (k !== 'tilecombos') dirty.add(k); });   // 조합 타일(확장 기능)은 쓸 때만 파일을 만듦
    em.emit('load');
    await save();
  }

  // ---------------- 편집 ----------------
  /** 여러 편집을 실행 취소 한 번으로 묶기 */
  let tx = null;
  function pushUndo(u) { if (tx) tx.push(u); else { undoStack.push(u); if (undoStack.length > UNDO_MAX) undoStack.shift(); } redoStack = []; }
  function transaction(label, fn) {
    if (tx) return fn();
    tx = [];
    try { fn(); } finally {
      const list = tx; tx = null;
      if (list.length === 1) undoStack.push(list[0]);
      else if (list.length) undoStack.push({ label, multi: list });
      if (undoStack.length > UNDO_MAX) undoStack.shift();
    }
  }
  function edit(key, label, fn, opts) {
    const obj = data[key];
    if (!obj) throw new Error('없는 리소스: ' + key);
    const before = JSON.stringify(obj);
    fn(obj);
    const after = JSON.stringify(obj);
    if (before === after) return false;
    pushUndo({ key, label, before, after });
    dirty.add(key); version++;
    em.emit('change', key, opts || {});
    em.emit('dirty');
    return true;
  }
  function add(key, obj, label) {
    if (data[key]) throw new Error('이미 있습니다: ' + key);
    data[key] = obj; dirty.add(key); removed.delete(key); version++;
    pushUndo({ key, label: label || '추가', before: null, after: JSON.stringify(obj) });
    em.emit('structure', key); em.emit('dirty');
  }
  function remove(key, label) {
    if (!data[key]) return;
    pushUndo({ key, label: label || '삭제', before: JSON.stringify(data[key]), after: null });
    delete data[key]; dirty.delete(key); removed.add(key); version++;
    em.emit('structure', key); em.emit('dirty');
  }
  function rename(oldKey, newKey) {
    if (data[newKey]) throw new Error('같은 이름이 이미 있습니다: ' + newKey);
    const obj = data[oldKey];
    remove(oldKey, '이름 바꾸기');
    obj.id = newKey.split(':')[1];
    add(newKey, obj, '이름 바꾸기');
  }
  function applySnap(key, json) {
    version++;
    if (json === null) { delete data[key]; dirty.delete(key); removed.add(key); em.emit('structure', key); }
    else {
      const existed = !!data[key];
      data[key] = JSON.parse(json); dirty.add(key); removed.delete(key);
      em.emit(existed ? 'change' : 'structure', key, { reload: true });
    }
    em.emit('dirty');
  }
  function undo() {
    const u = undoStack.pop(); if (!u) return null; redoStack.push(u);
    if (u.multi) u.multi.slice().reverse().forEach(x => applySnap(x.key, x.before)); else applySnap(u.key, u.before);
    return u.label;
  }
  function redo() {
    const u = redoStack.pop(); if (!u) return null; undoStack.push(u);
    if (u.multi) u.multi.forEach(x => applySnap(x.key, x.after)); else applySnap(u.key, u.after);
    return u.label;
  }

  return {
    on: em.on, emit: em.emit,
    get root() { return root; },
    get isOpen() { return !!root; },
    get version() { return version; },
    get: key => data[key],
    has: key => !!data[key],
    /** 열 때 파일이 없어 기본값으로 채웠고 아직 저장하지 않았는지 */
    wasMissing: key => missing.has(key),
    keys: type => type ? keysOf(type) : Object.keys(data),
    all: type => keysOf(type).map(k => data[k]),
    fileOf, load, save, createNew, edit, add, remove, rename, undo, redo, transaction,
    /** 다른 이름으로 저장: 파일은 이미 복사됐고, 이후 저장은 새 폴더로 */
    relocate(dir) { root = dir; em.emit('load'); },
    isDirty: () => dirty.size > 0 || removed.size > 0,
    /** 열 때 손상되어 기본값으로 연(아직 저장으로 덮어쓰지 않은) 파일의 프로젝트 기준 경로 — 검사(validate)가 보여 줌 */
    damaged: () => [...backup].filter(([, why]) => why === '손상').map(([k]) => pdm.relative(root, fileOf(k)).replace(/\\/g, '/')),
    dirtyKeys: () => [...dirty],
    undoLabel: () => (undoStack[undoStack.length - 1] || {}).label,
    redoLabel: () => (redoStack[redoStack.length - 1] || {}).label,
    /** 프로젝트 기준 상대 경로 → 절대 경로 */
    abs: rel => !rel ? '' : (/^([A-Za-z]:[\\/]|\/)/.test(rel) ? rel : pdm.join(root, rel)),
    /** 게임 저장소의 assets 폴더 */
    gameAssetsDir() {
      const p = data.project || {};
      if (!p.gameRepo) return null;
      return pdm.join(this.abs(p.gameRepo), 'core', 'src', 'main', 'assets');
    }
  };
})();

/** 파일 버전 올리기(형식이 바뀌면 여기에 변환 코드를 추가) */
PDM.migrate = function (type, obj) {
  obj.version = obj.version || 1;
  if (type === 'event') (obj.pages || []).forEach(p => { p.commands = p.commands || []; });
  if (type === 'hero') PDM.migrateHero(obj);
  if (type === 'char') { obj.dialogue = obj.dialogue || {}; obj.behaviors = obj.behaviors || {}; obj.heart = obj.heart || { enabled: false, traits: [], likes: [], dislikes: [], initial: { favor: 0, trust: 0 } }; }
  return obj;
};

/** 영웅: 예전 스킬 시스템(skills · signature · skillButton) → 주문(spells · spellbook), 특성 효과 skill → spell */
PDM.migrateHero = function (o) {
  if (Array.isArray(o.skills)) {
    if (!Array.isArray(o.spells) || !o.spells.length) {
      o.spells = o.skills.map(sk => {
        const x = Object.assign({}, sk);
        if (!x.tier) { const lv = x.unlockLevel || 1; x.tier = lv >= 21 ? 4 : lv >= 13 ? 3 : lv >= 7 ? 2 : 1; }
        return x;
      });
    }
    delete o.skills;
  }
  if (o.signature) {
    if (!o.spellbook) { const s = o.signature; o.spellbook = { enabled: true, name: s.name || '주문서', desc: s.desc || '', image: s.image ?? 246, charges: s.charges ?? 3, rechargeTurns: s.rechargeTurns ?? 40 }; }
    delete o.signature;
  }
  delete o.skillButton;
  (o.talents || []).forEach(t => (t.effects || []).forEach(e => {
    if (e.type === 'skill') { e.type = 'spell'; e.spell = e.skill; delete e.skill; }
    else if (e.type === 'unlockSkill') { e.type = 'unlockSpell'; e.spell = e.skill; delete e.skill; }
  }));
  if (!o.subclasses) o.subclasses = [];
  if (!o.abilities) o.abilities = [];
  if (!o.gauge) o.gauge = PDM.make.gauge();
  return o;
};
