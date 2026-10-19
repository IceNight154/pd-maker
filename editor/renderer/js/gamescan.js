// ================================================================
//  gamescan — 리소스 목록의 "게임 기본" 항목을 지금 게임 저장소(pd-maker/game/…)의 실제 파일에 맞춤
//    묶여 있는 목록(spd-items.js · spd-rooms.js · spd-chars.js)은 기준 저장소에서 미리 뽑아 둔 것.
//    저장소를 찾으면(app.resolveRepo) 그 폴더를 훑어서:
//      · 저장소에 파일이 없는 것은 목록에서 빼고
//      · 저장소에만 있는 것은 소스에서 이름·분류·그림을 읽어 덧붙임 (added: true)
//    결과: PDM.SPD_ITEM_GROUPS · PDM.SPD_ROOMS 를 바꾸고, PDM.GAME_SCAN 에 요약 { repo, items, rooms, mobs, newMobs, missingMob(cls) }
// ================================================================
(function () {
  const BASE = { items: PDM.SPD_ITEM_GROUPS, rooms: PDM.SPD_ROOMS, sprites: (PDM.SPD_ITEM_SPRITES || {}).vanilla || {} };   // 묶여 있는 원본 (다시 훑을 때 기준)
  const J = ['core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon'];
  const EXCL = new Set('Item EquipableItem KindOfWeapon KindofMisc Generator Heap ItemStatusHandler Recipe armor/Armor armor/ClassArmor artifacts/Artifact bags/Bag potions/Potion potions/exotic/ExoticPotion potions/brews/Brew potions/elixirs/Elixir scrolls/Scroll scrolls/InventoryScroll scrolls/exotic/ExoticScroll spells/Spell spells/InventorySpell spells/TargetedSpell stones/Runestone stones/InventoryStone trinkets/Trinket wands/Wand wands/DamageWand wands/CursedWand weapon/Weapon weapon/melee/MeleeWeapon weapon/missiles/MissileWeapon weapon/missiles/darts/TippedDart keys/Key rings/Ring remains/RemainsItem journal/DocumentPage weapon/codices/Codex weapon/codices/melee/MeleeCodex weapon/codices/ranged/RangedCodex weapon/codices/cast/CastCodex bags/grimoire/Grimoire'.split(' '));
  const HOLD = { potion: 'POTION_HOLDER', scroll: 'SCROLL_HOLDER', ring: 'RING_HOLDER', stone: 'STONE_HOLDER', wand: 'WAND_HOLDER', artifact: 'ARTIFACT_HOLDER', food: 'FOOD_HOLDER', bomb: 'BOMB_HOLDER', trinket: 'TRINKET_HOLDER', spell: 'SPELL_HOLDER', weapon: 'WEAPON_HOLDER', armor: 'ARMOR_HOLDER' };
  const TOP = { artifacts: 'artifact', rings: 'ring', wands: 'wand', stones: 'stone', spells: 'spell', bombs: 'bomb', food: 'food', keys: 'key', quest: 'quest', trinkets: 'trinket', journal: 'journal', remains: 'remains' };
  function itemCat(p, src) {
    const d = p.split('/');
    if (d[0] === 'weapon') {
      if (d[1] === 'codices') return ['codex', d[2] || 'melee'];
      if (d[1] === 'melee') return ['weapon', d[2] === 'gun' ? 'ranged' : 'melee'];
      if (d[2] === 'darts') return ['weapon', 'dart'];
      if (d[1] === 'missiles') return ['weapon', 'missile'];
      return ['weapon', 'ranged'];
    }
    if (d[0] === 'armor') return ['armor', /extends\s+ClassArmor/.test(src) ? 'class' : 'armor'];
    if (d[0] === 'potions') return ['potion', d.length > 2 ? ({ exotic: 'exotic', brews: 'brew', elixirs: 'elixir' }[d[1]] || '') : ''];
    if (d[0] === 'scrolls') return ['scroll', d.length > 2 ? 'exotic' : ''];
    if (d[0] === 'bags') return ['bag', d.length > 2 ? 'grimoire' : ''];
    if (d.length === 1) return ['misc', ''];
    return [TOP[d[0]] || 'misc', ''];
  }
  /** 폴더 아래의 모든 파일 (상대 경로, / 구분). 없으면 [] */
  async function walk(dir) {
    if (pdm.walk) { try { return await pdm.walk(dir); } catch (_) { /* 예전 실행 파일: 아래로 */ } }
    const out = [];
    const rec = async (d, rel) => { let l = []; try { l = await pdm.list(d); } catch (_) { return; }
      await Promise.all(l.map(e => e.dir ? rec(pdm.join(d, e.name), rel + e.name + '/') : void out.push(rel + e.name))); };
    await rec(dir, '');
    return out;
  }
  const javaSet = l => new Set(l.filter(f => f.endsWith('.java')).map(f => f.replace(/\\/g, '/').slice(0, -5)));
  /** 게임이 실제로 읽는 글자 폴더 (Assets.java 의 Messages 경로 — 원작은 messages, 어떤 모드는 new_messages 처럼 다른 폴더) */
  const msgRoots = {};
  /** 글자 폴더 목록 (Assets.java 에 나온 순서 — 뒤의 것이 앞의 것을 덮어씀). 예: ['messages', 'new_messages'] */
  async function msgRoot(repo) {
    if (msgRoots[repo]) return msgRoots[repo];
    const roots = [];
    try { const src = await pdm.readText(pdm.join(repo, ...J, 'Assets.java')); for (const m of src.matchAll(/"([\w.\-]+)\/(?:actors\/actors|items\/items)"/g)) if (!roots.includes(m[1])) roots.push(m[1]); } catch (_) { /* 없음 */ }
    if (!roots.length) roots.push('messages');
    return (msgRoots[repo] = roots);
  }
  PDM.gameMsgRoot = msgRoot;
  async function props(repo, name) {
    const d = {};
    for (const dir of await msgRoot(repo)) for (const f of [name + '.properties', name + '_ko.properties']) {   // 뒤의 것이 덮어씀: 한국어 · 나중 폴더
      try { (await pdm.readText(pdm.join(repo, 'core', 'src', 'main', 'assets', dir, name, f))).split(/\r?\n/).forEach(line => {
        if (line.startsWith('#')) return; const i = line.indexOf('='); if (i > 0) d[line.slice(0, i).trim()] = line.slice(i + 1); }); } catch (_) { /* 없음 */ }
    }
    return d;
  }
  /** 저장소의 sprites/ItemSpriteSheet.java 에서 그림 상수 → 번호 (xy(x,y) · 다른 상수 + 숫자). 16px 칸 시트만 */
  function parseItemSheet(src) {
    const cut = src.indexOf('class Icons'); if (cut > 0) src = src.slice(0, cut);
    if (/int\s+scale\s*=\s*[2-9]/.test(src)) return null;   // 32px 칸(mod-2) 시트는 묶여 있는 표를 씀
    const env = {}, out = {}, re = /(public|private)?\s*static\s+final\s+int\s+(\w+)\s*=\s*([^;]+);/g; let m;
    const val = e => { e = e.trim(); let t = 0;
      for (const part of e.replace(/-/g, '+-').split('+')) { const s = part.trim(); if (!s) continue; let v;
        const x = /^xy\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(s);
        if (x) v = (+x[1] - 1) + 16 * (+x[2] - 1); else if (/^-?\d+$/.test(s)) v = +s; else if (s in env) v = env[s]; else if (s[0] === '-' && s.slice(1) in env) v = -env[s.slice(1)]; else return null;
        t += v; }
      return t; };
    while ((m = re.exec(src))) { if (['WIDTH', 'SIZE', 'TX_WIDTH', 'TX_HEIGHT'].includes(m[2])) continue; const v = val(m[3]); if (v === null) continue; env[m[2]] = v; if (m[1] === 'public') out[m[2]] = v; }
    return Object.keys(out).length > 20 ? out : null;
  }
  PDM.gameProps = props; PDM.gameWalk = walk;
  const pretty = n => String(n).toLowerCase().replace(/(^|_)([a-z])/g, (m, a, b) => (a ? ' ' : '') + b.toUpperCase());
  const clean = s => String(s || '').replace(/\\n/g, ' ').replace(/_([^_]+)_/g, '$1').slice(0, 400);
  let last = '';

  /** 저장소를 훑어 목록을 맞춤. 바뀌었으면 true. force = 같은 저장소라도 다시 */
  PDM.gameScan = async function (repo, force) {
    if (!repo) { last = ''; if (PDM.GAME_SCAN) { PDM.SPD_ITEM_GROUPS = BASE.items; PDM.SPD_ROOMS = BASE.rooms; PDM.GAME_SCAN = null; return true; } return false; }
    if (repo === last && !force) return false;
    const root = pdm.join(repo, ...J);
    const [itemFiles, roomFiles, mobFiles] = (await Promise.all([walk(pdm.join(root, 'items')), walk(pdm.join(root, 'levels', 'rooms')), walk(pdm.join(root, 'actors', 'mobs'))])).map(javaSet);
    if (!itemFiles.size && !roomFiles.size) return false;   // 저장소를 못 읽음 → 그대로
    last = repo;
    const sum = { repo, items: { total: 0, added: [], removed: [] }, rooms: { total: 0, added: [], removed: [] }, mobs: mobFiles, newMobs: [], heroes: null };
    const read = async rel => { try { return await pdm.readText(pdm.join(root, rel)); } catch (_) { return ''; } };

    // ---- 아이템 그림 번호: 이 저장소의 ItemSpriteSheet 상수 (저장소마다 아이템 시트 배치가 다름)
    //      칸 크기 · 한 줄 칸 수도 ItemSpriteSheet 의 SIZE · WIDTH 에서 (9차: ARK 계열은 32px × 32칸 — 예전처럼 그림 너비 ÷ 16 으로 추정하면 어긋남)
    try {
      const src = await read('sprites/ItemSpriteSheet.java'), g = window.PDMJava && src ? window.PDMJava.itemSheet(src) : null;
      if (g && g.consts && g.scale === 1) { sum.itemSheet = { cell: g.cell, cols: g.cols, origin1: g.origin1 }; if (PDM.SPD_ITEM_SPRITES) PDM.SPD_ITEM_SPRITES.vanilla = g.consts; }
      else { const sh = parseItemSheet(src); if (PDM.SPD_ITEM_SPRITES) PDM.SPD_ITEM_SPRITES.vanilla = sh || BASE.sprites; }
    } catch (_) { /* 묶여 있는 표 그대로 */ }
    // ---- 아이템
    if (itemFiles.size) {
      const known = new Set(), groups = {};
      const msg = await props(repo, 'items');
      Object.entries(BASE.items).forEach(([c, l]) => l.forEach(e => { const f = e.p.replace(/\./g, '/'); known.add(f);
        if (!itemFiles.has(f)) { sum.items.removed.push(e.n); return; }
        const key = 'items.' + e.p.toLowerCase(), n = clean(msg[key + '.name']);   // 이름·설명은 이 저장소의 글자로 (모드가 바꿨을 수 있음)
        (groups[c] = groups[c] || []).push(n && n !== e.n ? Object.assign({}, e, { n, d: clean(msg[key + '.desc']) || e.d }) : e); }));
      const fresh = [...itemFiles].filter(f => !known.has(f) && !EXCL.has(f) && !/(^|\/)(curses|glyphs|enchantments)\//.test(f));
      if (fresh.length) {
        const sheet = (PDM.SPD_ITEM_SPRITES || {}).vanilla || {};
        // 그림 상수: 그 클래스 자신의 것만 (안쪽 클래스 — 탄환 등 — 의 image 는 빼고), 없으면 부모 클래스 것을 물려받음
        const byName = {}; itemFiles.forEach(f => { byName[f.split('/').pop()] = f; });
        const srcCache = {}, readItem = f => (srcCache[f] = srcCache[f] || read('items/' + f + '.java'));
        const ownImage = (src, cls) => { const at = src.search(new RegExp('class\\s+' + cls + '\\b')); if (at < 0) return null;
          const rest = src.slice(at + 6), inner = rest.search(/\n\s*(?:public |private |protected )?(?:static )?(?:abstract )?class\s+\w+/), own = inner < 0 ? rest : rest.slice(0, inner);
          const m = /\bimage\s*=\s*ItemSpriteSheet\.(\w+)/.exec(own); return m ? m[1] : null; };
        const imageOf = async (f, depth) => { const src = await readItem(f), cls = f.split('/').pop(); const mine = ownImage(src, cls); if (mine) return mine;
          const par = (new RegExp('class\\s+' + cls + '\\s+extends\\s+(\\w+)').exec(src) || [])[1]; return par && byName[par] && depth < 5 ? imageOf(byName[par], depth + 1) : null; };
        // 다른 새 아이템의 부모이면서 자기 그림이 없는 클래스(총기 종류의 바탕 AR · Gun 등)는 실제 아이템이 아니므로 목록에서 뺌
        const parents = new Set();
        await Promise.all(fresh.map(async f => { const par = (new RegExp('class\\s+' + f.split('/').pop() + '\\s+extends\\s+(\\w+)').exec(await readItem(f)) || [])[1]; if (par) parents.add(par); }));
        await Promise.all(fresh.map(async f => {
          const src = await readItem(f);
          if (parents.has(f.split('/').pop()) && !ownImage(src, f.split('/').pop())) return;
          const cls = f.split('/').pop();
          if (!src || /\babstract\s+class\b/.test(src) || !new RegExp('class\\s+' + cls + '\\s+extends').test(src)) return;
          const [c, sub] = itemCat(f, src);
          const key = 'items.' + f.replace(/\//g, '.').toLowerCase();
          const im = await imageOf(f, 0), m = im ? [0, im] : null;
          const t = /\btier\s*=\s*(\d+)/.exec(src) || /super\(\s*(\d+)\s*\)/.exec(src);
          const e = { p: f.replace(/\//g, '.'), sub, n: clean(msg[key + '.name']) || cls.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'), d: clean(msg[key + '.desc']), img: m && m[1] in sheet ? m[1] : (HOLD[c] || 'SOMETHING'), added: true };
          if (t && ['weapon', 'armor', 'codex'].includes(c)) e.t = +t[1];
          (groups[c] = groups[c] || []).push(e); sum.items.added.push(e.n);
        }));
        Object.values(groups).forEach(l => l.sort((a, b) => String(a.sub).localeCompare(String(b.sub)) || (a.t || 0) - (b.t || 0) || String(a.n).localeCompare(String(b.n))));
      }
      PDM.SPD_ITEM_GROUPS = groups;
      sum.items.total = Object.values(groups).reduce((a, l) => a + l.length, 0);
    }

    // ---- 방
    if (roomFiles.size) {
      const known = new Set(), rooms = [];
      BASE.rooms.forEach(r => { const f = r.file.replace(/^levels\/rooms\//, '').replace(/\.java$/, ''); known.add(f); if (roomFiles.has(f)) rooms.push(r); else sum.rooms.removed.push(r.name); });
      await Promise.all([...roomFiles].filter(f => !known.has(f)).map(async f => {
        const src = await read('levels/rooms/' + f + '.java'), cls = f.split('/').pop();
        const m = new RegExp('public\\s+(abstract\\s+)?class\\s+' + cls + '\\s+extends\\s+(\\w+)').exec(src);
        if (!m) return;
        const top = f.includes('/') ? f.split('/')[0] : '', abs = !!m[1], vault = f.startsWith('quest/vault');
        const cat = abs ? 'base' : vault ? 'vault' : /Entrance(Room)?$/.test(cls) ? 'entrance' : /ExitRoom$/.test(cls) ? 'exit' : (top || 'base');
        const why = abs ? '바탕 클래스' : vault ? '금고 층 전용' : ['entrance', 'exit'].includes(cat) ? '입구·출구는 층마다 자동으로 하나씩 놓임' : top === 'sewerboss' ? '하수도 보스 층 전용' : '';
        const o = { id: f.replace(/\//g, '.'), cls, cat, name: cls, desc: '게임 저장소에서 새로 찾은 방', base: m[2], file: 'levels/rooms/' + f + '.java', added: true };
        if (why) o.noUse = why;
        rooms.push(o); sum.rooms.added.push(cls);
      }));
      rooms.forEach(r => { if (!(PDM.SPD_ROOM_CATS || []).some(c => c[0] === r.cat)) PDM.SPD_ROOM_CATS.push([r.cat, r.cat]); });
      PDM.SPD_ROOMS = rooms; sum.rooms.total = rooms.length;
    }

    // ---- 몬스터: 묶여 있는 목록에도 프로젝트에도 없는 클래스 (캐릭터 목록 "저장소에서 새로 찾음")
    if (mobFiles.size) {
      const known = new Set((PDM.SPD_CHARS || []).map(e => String(e.cls).split('$')[0].replace(/\./g, '/')));
      const fresh = [...mobFiles].filter(f => !known.has(f));
      if (fresh.length) {
        const msg = await props(repo, 'actors');
        await Promise.all(fresh.map(async f => {
          const src = await read('actors/mobs/' + f + '.java'), cls = f.split('/').pop();
          if (!src || /\babstract\s+class\b/.test(src) || !/spriteClass\s*=/.test(src)) return;
          const key = 'actors.mobs.' + f.replace(/\//g, '.').toLowerCase();
          const hp = /\bHP\s*=\s*HT\s*=\s*(\d+)/.exec(src) || /\bHT\s*=\s*(\d+)/.exec(src);
          sum.newMobs.push({ cls: f.replace(/\//g, '.'), kind: f.startsWith('npcs/') ? 'npc' : 'mob', name: clean(msg[key + '.name']) || cls, desc: clean(msg[key + '.desc']), stats: hp ? { hp: +hp[1] } : {} });
        }));
        sum.newMobs.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    // ---- 영웅 직업: actors/hero/HeroClass.java 의 enum 상수
    try {
      const src = await read('actors/hero/HeroClass.java'), m = /enum\s+HeroClass\s*\{([\s\S]*?);/.exec(src);
      if (m) {
        const names = [...m[1].replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|,)\s*([A-Z][A-Z0-9_]*)\s*(?=\(|,|$)/g)].map(x => x[1]);
        const msg = await props(repo, 'actors');
        // 영웅 시트: HeroClass.spritesheet() 의 switch(this) 가 고르는 Assets 상수 → 실제 파일 (9차: 직업 이름과 파일 이름이 다른 파생작 — ARK 의 WARRIOR → sprites/blaze.png)
        let sheets = { map: {}, def: '' };
        try { if (window.PDMJava) sheets = window.PDMJava.heroSheets(src, window.PDMJava.assets(await read('Assets.java')).map); } catch (_) { /* 예전 규칙 */ }
        sum.heroes = names.map(n => ({ cls: n, name: clean(msg['actors.hero.heroclass.' + n.toLowerCase()]) || pretty(n), desc: clean(msg['actors.hero.heroclass.' + n.toLowerCase() + '_desc']), sheet: sheets.map[n] || sheets.def || '' }));
        // 영웅 그림 한 칸 크기 (sprites/HeroSprite.java 의 FRAME_WIDTH · FRAME_HEIGHT — 모드마다 다를 수 있음)
        const hsp = await read('sprites/HeroSprite.java'), fw = /FRAME_WIDTH\s*=\s*(\d+)/.exec(hsp), fh = /FRAME_HEIGHT\s*=\s*(\d+)/.exec(hsp);
        if (fw && fh) sum.heroFrame = [+fw[1], +fh[1]];
        // 영웅 선택 화면에서 감춘 직업: HeroSelectScene 의 "if (cl == HeroClass.X) break;" → X 부터 뒤는 나오지 않음
        const hs = await read('scenes/HeroSelectScene.java'), hb = /==\s*HeroClass\.(\w+)\s*\)\s*break\s*;/.exec(hs), cutAt = hb ? names.indexOf(hb[1]) : -1;
        if (cutAt > 0) sum.heroes.forEach((x, i) => { if (i >= cutAt) x.hidden = true; });
        // "if (cl == HeroClass.A || cl == HeroClass.B …) continue;" → 그 직업들만 건너뜀
        for (const m of hs.replace(/\/\/[^\n]*/g, '').matchAll(/\bif\s*\(([^;{}]{0,600}?)\)\s*continue\s*;/g)) {
          const parts = m[1].split('||').map(t => /^\s*\w+\s*==\s*HeroClass\s*\.\s*(\w+)\s*$/.exec(t));
          if (parts.every(Boolean)) parts.forEach(c => { const x = sum.heroes.find(q => q.cls === c[1]); if (x) x.hidden = true; });
        }
      }
    } catch (_) { /* 없음 */ }
    // ---- 층별 몬스터 목록 클래스 (원작 MobSpawner — 파생작은 이름이 다를 수 있음: ARK 의 MobRotation)
    sum.mobRotation = 'actors/mobs/MobSpawner.java';
    if (mobFiles.size && !mobFiles.has('MobSpawner')) {
      sum.mobRotation = '';
      for (const f of mobFiles) { if (/\//.test(f)) continue; const s2 = await read('actors/mobs/' + f + '.java'); if (/\bstandardMobRotation\s*\(/.test(s2)) { sum.mobRotation = 'actors/mobs/' + f + '.java'; break; } }
    }
    // ---- 저장소 분석기 (editor/repo-analyzer.js — Electron · 테스트 환경에서만): 상속 · 스프라이트 · 능력치 · 원본 위치로 새 몬스터를 보강
    sum.analysis = null;
    if (pdm.analyzeRepo) {
      try {
        const rep = await pdm.analyzeRepo(repo);
        if (rep && rep.objects) {
          PDM.REPO_ANALYSIS = rep;
          sum.analysis = { fingerprint: rep.fingerprint, generatedAt: rep.generatedAt, cached: !!rep.cached, summary: rep.summary, features: (rep.features || []).map(f => f.id) };
          if (rep.objects.mobRotation) sum.mobRotation = rep.objects.mobRotation.rel;
          if (rep.itemSheet && rep.itemSheet.consts && (rep.itemSheet.scale || 1) === 1 && !sum.itemSheet) sum.itemSheet = { cell: rep.itemSheet.cell, cols: rep.itemSheet.cols, origin1: rep.itemSheet.origin1 };
          const known = new Set((PDM.SPD_CHARS || []).map(e => String(e.cls).split('$')[0].replace(/\./g, '/')));
          const msgA = await props(repo, 'actors'), seen = new Set();
          // 그림을 못 읽은 몬스터도 빼지 않음 (임시 그림 + 이유) — 예전 목록에 있던 것을 잃지 않게 (예: ARK TheEndspeaker 는 spriteClass 를 코드로 고름)
          const fresh = (rep.objects.mobs || []).filter(m => m.convertible && !String(m.cls).includes('$') && !known.has(String(m.cls).replace(/\./g, '/')));
          sum.newMobs = fresh.filter(m => !seen.has(m.cls) && seen.add(m.cls)).map(m => {
            const e = { cls: m.cls, kind: m.cls.startsWith('npcs.') ? 'npc' : 'mob', name: m.name || clean(msgA['actors.mobs.' + m.cls.toLowerCase() + '.name']) || m.simple, desc: m.desc || '',
              stats: {}, source: { file: m.file, line: m.line }, extracted: ['name', 'desc'] };
            if (m.stats.hp != null) { e.stats.hp = m.stats.hp; e.extracted.push('stats.hp'); } if (m.stats.evasion != null) { e.stats.evasion = m.stats.evasion; e.extracted.push('stats.evasion'); } if (m.stats.exp != null) { e.exp = m.stats.exp; e.extracted.push('exp'); }
            if (m.spriteOk) { e.sprite = { sheet: 'game:' + m.sprite.sheet, frame: m.sprite.frame.slice(), scale: 0, anims: JSON.parse(JSON.stringify(m.sprite.anims)) }; e.extracted.push('sprite'); e.spriteFrom = m.sprite.file; }
            else e.spriteProblem = (m.reasons || []).join(' · ');
            return e; }).sort((a, b) => a.name.localeCompare(b.name));
        }
      } catch (e) { console.error(e); PDM.log && PDM.log('저장소 분석기가 실패했습니다 (리소스 목록은 예전 방식으로 읽음): ' + (e && e.message), 'err'); }
    }
    /** 프로젝트 캐릭터의 game 클래스가 이 저장소에 없는지 */
    sum.missingMob = cls => !!cls && mobFiles.size > 0 && !mobFiles.has(String(cls).split('$')[0].replace(/\./g, '/'));
    sum.msgRoot = (await msgRoot(repo)).join(' + ');
    PDM.GAME_SCAN = sum; if (PDM.gameHeroClear) PDM.gameHeroClear(); if (PDM.gameInfoClear) PDM.gameInfoClear();
    const part = (n, s) => `${n} ${s.total}개` + (s.added.length ? ` (+${s.added.length} 새로 찾음)` : '') + (s.removed.length ? ` (−${s.removed.length} 저장소에 없음)` : '');
    PDM.log && PDM.log(`게임 저장소에 맞춰 목록을 고쳤습니다 — ${part('아이템', sum.items)}, ${part('방', sum.rooms)}` + (sum.newMobs.length ? `, 새 몬스터 ${sum.newMobs.length}` : ''), 'ok');
    return true;
  };
  /** 프로젝트의 원작 영웅 · 캐릭터를 지금 게임 저장소에 맞춤 (새 프로젝트를 다른 저장소로 만들었을 때):
   *  저장소에 없는 원작 캐릭터·영웅은 빼고, 저장소에만 있는 몬스터·직업은 더함. 직접 만든 것(game · baseClass 없음)은 건드리지 않음. → 바뀐 수 */
  PDM.gameSyncVanilla = async function (fixOnly) {   // fixOnly = 더하거나 빼지 않고 이미 있는 영웅의 이름·그림 칸만 맞춤
    const sc = PDM.GAME_SCAN, store = PDM.store; if (!sc || !store.isOpen) return null;
    const res = { charsRemoved: 0, charsAdded: 0, heroesRemoved: 0, heroesAdded: 0 };
    // 영웅 시트 높이 (갑옷 단계 줄 수를 알려고) — 미리 읽어 둠
    const sheetH = {};
    const sheetOf = x => 'game:' + (x.sheet || 'sprites/' + x.cls.toLowerCase() + '.png'), convOf = cls => 'game:sprites/' + String(cls).toLowerCase() + '.png';
    if (sc.heroFrame) for (const x of sc.heroes || []) { try { const im = await PDM.assets.load(sheetOf(x)); if (!im) continue;
        // 그림이 실제로 그려진 줄만 씀 (갑옷 단계 그림이 한 줄뿐인 시트: 아래 줄이 비어 있음)
        const [fw, fh] = sc.heroFrame, n = Math.max(1, Math.floor(im.height / fh)), cv = document.createElement('canvas'); cv.width = fw; cv.height = n * fh;
        const g = cv.getContext('2d'); g.drawImage(im, 0, 0, fw, n * fh, 0, 0, fw, n * fh); const d = g.getImageData(0, 0, fw, n * fh).data, used = [];
        for (let r = 0; r < n; r++) { let c = 0; for (let k = r * fh * fw; k < (r + 1) * fh * fw; k++) if (d[k * 4 + 3] > 0) c++; if (c > 20) used.push(r); }
        sheetH[x.cls] = used.length ? used : [0]; } catch (_) { /* 없음 */ } }
    const fixSprite = (sp, cls) => { const x = (sc.heroes || []).find(q => q.cls === cls) || { cls };
      if (!sp || (sp.sheet !== convOf(cls) && sp.sheet !== sheetOf(x))) return false;
      let changed = false;
      if (sp.sheet !== sheetOf(x)) { sp.sheet = sheetOf(x); changed = true; }   // 원작 규칙(sprites/<직업>.png)으로 넣어 둔 것 → 게임이 실제로 쓰는 시트
      if (!sc.heroFrame) return changed;
      const [fw, fh] = sc.heroFrame, used = sheetH[cls] || [0, 1, 2, 3, 4, 5, 6], tr = [0, 1, 2, 3, 4, 5, 6].map(i => used[Math.min(i, used.length - 1)]);
      if ((sp.frame || [])[0] === fw && (sp.frame || [])[1] === fh && JSON.stringify(sp.tierRows || []) === JSON.stringify(tr) && sp.rowsChecked) return changed;
      sp.frame = [fw, fh]; sp.tierRows = tr; sp.rowsChecked = true; return true; };
    const titled = n => String(n).toLowerCase().replace(/(^|_)([a-z])/g, (m, a, b) => (a ? ' ' : '') + b.toUpperCase());
    store.transaction('게임 저장소에 맞추기', () => {
      if (!fixOnly) store.all('char').forEach(c => { if (c.game && sc.missingMob(c.game)) { store.remove('char:' + c.id, '저장소에 없는 캐릭터'); res.charsRemoved++; } });
      const have = new Set(store.all('char').map(c => c.game).filter(Boolean));
      (fixOnly ? [] : sc.newMobs || []).forEach(e => { if (have.has(e.cls)) return; const c = PDM.make.vanillaChar(Object.assign({}, e, { sprite: e.sprite || PDM.make.character('x', e.kind).sprite })); if (store.has('char:' + c.id)) return;
        c.note = '게임 저장소에서 찾은 캐릭터 (actors.mobs.' + e.cls + ') — 그림·능력치·AI 는 게임 코드의 값을 씁니다 (캐릭터 화면 위 "게임 코드의 실제 값" 참고)' + (e.sprite ? '' : ' · 그림을 소스에서 읽지 못해 임시 그림' + (e.spriteProblem ? ' (' + e.spriteProblem + ')' : ''));
        // 9차: 어디서 읽었는지 · 무엇이 원본에서 뽑은 값인지 (나머지는 PDMaker 기본값) — 다시 저장해도 그대로 남음
        if (e.source) c.origin = { repo: pdm.basename(sc.repo), file: e.source.file, line: e.source.line, extracted: (e.extracted || []).slice(), sprite: e.spriteFrom || '' };
        store.add('char:' + c.id, c, '게임 캐릭터 추가'); res.charsAdded++; });
      if (sc.heroes && sc.heroes.length) {
        const ok = new Set(sc.heroes.map(x => x.cls));
        if (!fixOnly) store.all('hero').forEach(hr => { if (hr.baseClass && !ok.has(hr.baseClass)) { store.remove('hero:' + hr.id, '저장소에 없는 영웅'); res.heroesRemoved++; } });
        const haveH = new Set(store.all('hero').map(x => x.baseClass).filter(Boolean)), tpl = store.all('hero').find(x => x.baseClass && x.sprite && x.sprite.sheet);
        (fixOnly ? [] : sc.heroes).forEach(x => { if (haveH.has(x.cls)) return; const id = x.cls.toLowerCase(); if (store.has('hero:' + id)) return;
          const hr = PDM.make.hero(id); Object.assign(hr, { name: x.name, desc: String(x.desc || ''), baseClass: x.cls, note: '게임 저장소의 직업 — 비워 둔 항목(그림·특성·전직·직업 능력)은 게임 코드의 값을 씁니다 (각 섹션 위 상자에 실제 값 표시)' });
          if (hr.spellbook) hr.spellbook.enabled = false;
          if (x.hidden) hr.enabled = false;
          if (tpl) hr.sprite = Object.assign(PDM.clone(tpl.sprite), { sheet: sheetOf(x) });
          hr.origin = { repo: pdm.basename(sc.repo), file: 'actors/hero/HeroClass.java', extracted: ['name', 'desc'].concat(x.sheet ? ['sprite.sheet'] : []) };
          fixSprite(hr.sprite, x.cls);
          store.add('hero:' + id, hr, '게임 영웅 추가'); res.heroesAdded++; });
        // 이미 있는 영웅: 이름이 클래스 이름 그대로(번역을 못 찾았던 것)면 저장소의 이름·설명으로, 그림 칸 크기도 저장소에 맞춤
        sc.heroes.forEach(x => { const hr = store.all('hero').find(q => q.baseClass === x.cls); if (!hr) return;
          const stale = !hr.name || hr.name === x.cls || hr.name === titled(x.cls), needName = stale && x.name && x.name !== hr.name, needDesc = !hr.desc && x.desc, sp = PDM.clone(hr.sprite || {}), needSp = fixSprite(sp, x.cls);
          if (needName || needDesc || needSp) { store.edit('hero:' + hr.id, '저장소에 맞춤', r => { if (needName) r.name = x.name; if (needDesc) r.desc = x.desc; if (needSp) r.sprite = sp; }); res.heroesFixed = (res.heroesFixed || 0) + 1; } });
        // 그 저장소가 영웅 선택 화면에서 감춘 직업은 프로젝트에서도 꺼 둠 (영웅 편집 화면의 "사용"으로 다시 켤 수 있음)
        (fixOnly ? [] : sc.heroes.filter(x => x.hidden)).forEach(x => { const hr = store.all('hero').find(q => q.baseClass === x.cls); if (hr && hr.enabled !== false) { store.edit('hero:' + hr.id, '감춘 직업', r => { r.enabled = false; }); res.heroesHidden = (res.heroesHidden || 0) + 1; } });
        if (res.heroesRemoved || res.heroesAdded || res.heroesHidden) store.edit('project', '영웅 순서', r => { r.heroOrder = sc.heroes.map(x => x.cls.toLowerCase()).filter(id => store.has('hero:' + id)); if (r.startHero && !store.has('hero:' + r.startHero)) r.startHero = ''; });
      }
    });
    return res;
  };
  /** 저장소에는 있는데 프로젝트에 없는 직업·몬스터 수 (프로젝트를 열었을 때 알려 주려고) */
  PDM.gameSyncNeeded = function () {
    const sc = PDM.GAME_SCAN, store = PDM.store; if (!sc || !store.isOpen) return null;
    const haveH = new Set(store.all('hero').map(x => x.baseClass).filter(Boolean)), haveC = new Set(store.all('char').map(c => c.game).filter(Boolean));
    const heroes = (sc.heroes || []).filter(x => !haveH.has(x.cls)).length, mobs = (sc.newMobs || []).filter(e => !haveC.has(e.cls)).length;
    const gone = store.all('char').filter(c => c.game && sc.missingMob(c.game)).length + (sc.heroes ? store.all('hero').filter(hr => hr.baseClass && !sc.heroes.some(x => x.cls === hr.baseClass)).length : 0);
    const titled = n => String(n).toLowerCase().replace(/(^|_)([a-z])/g, (m, a, b) => (a ? ' ' : '') + b.toUpperCase());
    const fix = (sc.heroes || []).filter(x => { const hr = store.all('hero').find(q => q.baseClass === x.cls); if (!hr) return false;
      const conv = 'game:sprites/' + x.cls.toLowerCase() + '.png', real = 'game:' + (x.sheet || 'sprites/' + x.cls.toLowerCase() + '.png');
      if (hr.sprite && hr.sprite.sheet === conv && real !== conv) return true;   // 시트 경로가 게임 실제 시트와 다름
      return ((hr.name === x.cls || hr.name === titled(x.cls)) && x.name && x.name !== hr.name) || (sc.heroFrame && hr.sprite && (hr.sprite.sheet === conv || hr.sprite.sheet === real) && ((hr.sprite.frame || [])[0] !== sc.heroFrame[0] || (hr.sprite.frame || [])[1] !== sc.heroFrame[1] || !hr.sprite.rowsChecked)); }).length;
    return { heroes, mobs, gone, fix };
  };
})();
