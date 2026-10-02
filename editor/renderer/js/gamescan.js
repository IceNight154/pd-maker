// ================================================================
//  gamescan — 리소스 목록의 "게임 기본" 항목을 지금 게임 저장소(pd-maker/game/…)의 실제 파일에 맞춤
//    묶여 있는 목록(spd-items.js · spd-rooms.js · spd-chars.js)은 기준 저장소에서 미리 뽑아 둔 것.
//    저장소를 찾으면(app.resolveRepo) 그 폴더를 훑어서:
//      · 저장소에 파일이 없는 것은 목록에서 빼고
//      · 저장소에만 있는 것은 소스에서 이름·분류·그림을 읽어 덧붙임 (added: true)
//    결과: PDM.SPD_ITEM_GROUPS · PDM.SPD_ROOMS 를 바꾸고, PDM.GAME_SCAN 에 요약 { repo, items, rooms, mobs, newMobs, missingMob(cls) }
// ================================================================
(function () {
  const BASE = { items: PDM.SPD_ITEM_GROUPS, rooms: PDM.SPD_ROOMS };   // 묶여 있는 원본 (다시 훑을 때 기준)
  const J = ['core', 'src', 'main', 'java', 'com', 'shatteredpixel', 'shatteredpixeldungeon'];
  const EXCL = new Set('Item EquipableItem KindOfWeapon KindofMisc Generator Heap ItemStatusHandler Recipe armor/Armor armor/ClassArmor artifacts/Artifact bags/Bag potions/Potion potions/exotic/ExoticPotion potions/brews/Brew potions/elixirs/Elixir scrolls/Scroll scrolls/InventoryScroll scrolls/exotic/ExoticScroll spells/Spell spells/InventorySpell spells/TargetedSpell stones/Runestone stones/InventoryStone trinkets/Trinket wands/Wand wands/DamageWand wands/CursedWand weapon/Weapon weapon/melee/MeleeWeapon weapon/missiles/MissileWeapon weapon/missiles/darts/TippedDart keys/Key rings/Ring remains/RemainsItem journal/DocumentPage weapon/codices/Codex weapon/codices/melee/MeleeCodex weapon/codices/ranged/RangedCodex weapon/codices/cast/CastCodex bags/grimoire/Grimoire'.split(' '));
  const HOLD = { potion: 'POTION_HOLDER', scroll: 'SCROLL_HOLDER', ring: 'RING_HOLDER', stone: 'STONE_HOLDER', wand: 'WAND_HOLDER', artifact: 'ARTIFACT_HOLDER', food: 'FOOD_HOLDER', bomb: 'BOMB_HOLDER', trinket: 'TRINKET_HOLDER', spell: 'SPELL_HOLDER', weapon: 'WEAPON_HOLDER', armor: 'ARMOR_HOLDER' };
  const TOP = { artifacts: 'artifact', rings: 'ring', wands: 'wand', stones: 'stone', spells: 'spell', bombs: 'bomb', food: 'food', keys: 'key', quest: 'quest', trinkets: 'trinket', journal: 'journal', remains: 'remains' };
  function itemCat(p, src) {
    const d = p.split('/');
    if (d[0] === 'weapon') {
      if (d[1] === 'codices') return ['codex', d[2] || 'melee'];
      if (d[1] === 'melee') return ['weapon', 'melee'];
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
  async function props(repo, name) {
    const d = {};
    for (const f of [name + '.properties', name + '_ko.properties']) {   // 한국어가 있으면 덮어씀
      try { (await pdm.readText(pdm.join(repo, 'core', 'src', 'main', 'assets', 'messages', name, f))).split(/\r?\n/).forEach(line => {
        if (line.startsWith('#')) return; const i = line.indexOf('='); if (i > 0) d[line.slice(0, i).trim()] = line.slice(i + 1); }); } catch (_) { /* 없음 */ }
    }
    return d;
  }
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
    const sum = { repo, items: { total: 0, added: [], removed: [] }, rooms: { total: 0, added: [], removed: [] }, mobs: mobFiles, newMobs: [] };
    const read = async rel => { try { return await pdm.readText(pdm.join(root, rel)); } catch (_) { return ''; } };

    // ---- 아이템
    if (itemFiles.size) {
      const known = new Set(), groups = {};
      Object.entries(BASE.items).forEach(([c, l]) => l.forEach(e => { const f = e.p.replace(/\./g, '/'); known.add(f); if (itemFiles.has(f)) (groups[c] = groups[c] || []).push(e); else sum.items.removed.push(e.n); }));
      const fresh = [...itemFiles].filter(f => !known.has(f) && !EXCL.has(f) && !/(^|\/)(curses|glyphs|enchantments)\//.test(f));
      if (fresh.length) {
        const msg = await props(repo, 'items');
        const sheet = (PDM.SPD_ITEM_SPRITES || {}).vanilla || {};
        await Promise.all(fresh.map(async f => {
          const src = await read('items/' + f + '.java');
          const cls = f.split('/').pop();
          if (!src || /\babstract\s+class\b/.test(src) || !new RegExp('class\\s+' + cls + '\\s+extends').test(src)) return;
          const [c, sub] = itemCat(f, src);
          const key = 'items.' + f.replace(/\//g, '.').toLowerCase();
          const m = /image\s*=\s*ItemSpriteSheet\.(\w+)/.exec(src);
          const t = /\btier\s*=\s*(\d+)/.exec(src) || /super\(\s*(\d+)\s*\)/.exec(src);
          const e = { p: f.replace(/\//g, '.'), sub, n: clean(msg[key + '.name']) || cls, d: clean(msg[key + '.desc']), img: m && m[1] in sheet ? m[1] : (HOLD[c] || 'SOMETHING'), added: true };
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
    /** 프로젝트 캐릭터의 game 클래스가 이 저장소에 없는지 */
    sum.missingMob = cls => !!cls && mobFiles.size > 0 && !mobFiles.has(String(cls).split('$')[0].replace(/\./g, '/'));
    PDM.GAME_SCAN = sum;
    const part = (n, s) => `${n} ${s.total}개` + (s.added.length ? ` (+${s.added.length} 새로 찾음)` : '') + (s.removed.length ? ` (−${s.removed.length} 저장소에 없음)` : '');
    PDM.log && PDM.log(`게임 저장소에 맞춰 목록을 고쳤습니다 — ${part('아이템', sum.items)}, ${part('방', sum.rooms)}` + (sum.newMobs.length ? `, 새 몬스터 ${sum.newMobs.length}` : ''), 'ok');
    return true;
  };
})();
