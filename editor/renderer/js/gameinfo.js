// ================================================================
//  gameinfo — "게임 원래 …" 라고만 적던 곳에 실제 값을 보여 주기 위한 읽기 (저장소 소스에서)
//    PDM.gameMob(cls)            → 몬스터 클래스의 능력치 · 전리품 · 그림 · 속성 · 코드 (부모 클래스 값도 이어받음)
//    PDM.gameMobBox(c, st)       → 캐릭터 편집기의 "게임 원래 값" 상자
//    PDM.gameMobLoot(cls)        → "금화 50%" 같은 한 줄 (드랍 테이블 표)
//    PDM.gameRotation(depth)     → 그 깊이에 게임이 뽑는 몬스터 목록 (MobSpawner)
//    PDM.gameSpawnBox(depth)     → 맵 편집기 "몬스터 스폰" 의 설명 상자
//    PDM.gameLevelBox(theme)     → 구성 블럭이 비었을 때 게임이 만드는 방 수 (지역 Level 클래스)
//    PDM.gameHeapBox(kind)       → 상자류가 게임에서 어디에 어떻게 놓이는지
//    PDM.gameHeroText(c, field)  → 영웅 선택 화면 글자 (짧은 설명 · 정보 · 해금)
// ================================================================
(function () {
  const h = PDM.h, G = PDM.gameSrc;
  const { strip, method, caseBodies, fmt, lc, codeView, fold, kv, mono, itemName, usageFold } = G;
  const cache = {};
  const root = () => pdm.join(G.repoOf(), ...G.J);
  const read = async rel => { try { return await pdm.readText(pdm.join(root(), rel)); } catch (_) { return ''; } };
  const memo = (k, fn) => { const key = G.repoOf() + '|' + k; return cache[key] || (cache[key] = fn().catch(e => { delete cache[key]; return null; })); };
  const msgs = () => memo('msg', async () => PDM.gameProps ? PDM.gameProps(G.repoOf(), 'actors') : {});
  const num = s => +String(s).replace(/f$/i, '');
  const range = body => { const m = /Random\.\w*Int\w*\(\s*([^,()]+?)\s*,\s*([^()]+?)\s*\)/.exec(body || ''); return m ? [m[1].trim(), m[2].trim()] : null; };
  const ret = body => { const m = /return\s+([^;]+);/.exec(body || ''); return m ? m[1].trim() : null; };
  const PROPS = { BOSS: '보스', MINIBOSS: '중간 보스', BOSS_MINION: '보스의 부하', UNDEAD: '언데드', DEMONIC: '악마', INORGANIC: '무기물', FIERY: '불 속성', ICY: '얼음 속성', ACIDIC: '산성', ELECTRIC: '전기', LARGE: '큰 몸집', IMMOVABLE: '밀리지 않음', STATIC: '고정', FLYING: '비행' };

  /** 몬스터 클래스 하나 (cls: 'Rat' · 'npcs.Shopkeeper' 처럼 actors/mobs 아래 경로) */
  PDM.gameMob = cls => memo('mob|' + cls, async () => {
    if (!G.repoOf() || !cls) return null;
    const file = 'actors/mobs/' + String(cls).replace(/\./g, '/') + '.java', code = await read(file);
    if (!code) return null;
    const s = strip(code), msg = await msgs(), key = 'actors.mobs.' + lc(cls);
    const simple = String(cls).split('.').pop(), ext = new RegExp('class\\s+' + simple + '\\s+extends\\s+(\\w+)').exec(s);
    const f = (re, map) => { const m = re.exec(s); return m ? (map ? map(m) : m[1]) : null; };
    const d = { cls, file, code, lines: code.split('\n').length, parent: ext ? ext[1] : '',
      name: fmt(msg[key + '.name']), desc: fmt(msg[key + '.desc']),
      hp: f(/\bHP\s*=\s*HT\s*=\s*([^;]+);/) || f(/\bHT\s*=\s*([^;]+);/), defenseSkill: f(/\bdefenseSkill\s*=\s*([^;]+);/), exp: f(/\bEXP\s*=\s*([^;]+);/), maxLvl: f(/\bmaxLvl\s*=\s*([^;]+);/),
      speed: f(/\bbaseSpeed\s*=\s*([^;]+);/), flying: /\bflying\s*=\s*true/.test(s) || null, sprite: f(/\bspriteClass\s*=\s*(\w+)\.class/),
      loot: f(/\bloot\s*=\s*([^;]+);/), lootChance: f(/\blootChance\s*=\s*([^;]+);/), state: f(/\bstate\s*=\s*([A-Z_]+)\s*;/),
      props: [...s.matchAll(/properties\.add\(\s*Property\.(\w+)/g)].map(m => m[1]),
      dmg: range((method(s, /int\s+damageRoll\s*\(\s*\)\s*\{/) || {}).body), atk: ret((method(s, /int\s+attackSkill\s*\([^)]*\)\s*\{/) || {}).body), dr: range((method(s, /int\s+drRoll\s*\(\s*\)\s*\{/) || {}).body),
      lootFn: ['createLoot', 'rollToDropLoot', 'lootChance'].map(n => method(code, new RegExp('\\b' + n + '\\s*\\([^)]*\\)\\s*\\{'))).filter(Boolean) };
    // 부모가 같은 폴더의 다른 몬스터면 빈 값을 이어받음 (예: Albino extends Rat)
    if (d.parent && !['Mob', 'NPC', 'Char', 'Actor'].includes(d.parent)) {
      const dir = String(cls).includes('.') ? String(cls).slice(0, String(cls).lastIndexOf('.') + 1) : '';
      const p = (await PDM.gameMob(dir + d.parent)) || (dir ? await PDM.gameMob(d.parent) : null);
      if (p) { d.from = {}; for (const k of ['hp', 'defenseSkill', 'exp', 'maxLvl', 'speed', 'flying', 'sprite', 'loot', 'lootChance', 'dmg', 'atk', 'dr']) if ((d[k] === null || d[k] === undefined) && p[k] !== null && p[k] !== undefined) { d[k] = p[k]; d.from[k] = (p.from && p.from[k]) || p.cls; }
        if (!d.props.length && p.props.length) d.props = p.props.slice(); }
    }
    return d;
  });
  /** 전리품을 사람이 읽는 말로: Gold.class → 금화 · Generator.Category.POTION → 물약 중 무작위 */
  const CAT = { WEAPON: '무기', ARMOR: '갑옷', MISSILE: '투척 무기', WAND: '마법봉', RING: '반지', ARTIFACT: '유물', FOOD: '음식', POTION: '물약', SEED: '씨앗', SCROLL: '주문서', STONE: '룬석', GOLD: '금화', TRINKET: '장신구' };
  function lootText(d) {
    if (!d || !d.loot) return d && d.lootFn.length ? '코드로 정함 (' + d.lootFn.map(m => (/(createLoot|rollToDropLoot|lootChance)/.exec(m.code) || [])[1]).join(' · ') + ')' : '없음';
    const c = /Generator\.Category\.(\w+)/.exec(d.loot), k = /^(?:new\s+)?(\w+)(?:\.class|\s*\()/.exec(d.loot);
    const what = c ? (CAT[c[1]] || c[1]) + ' 중 무작위' : k ? itemName(k[1]).name : d.loot;
    const ch = d.lootChance ? (isNaN(num(d.lootChance)) ? d.lootChance : (Math.round(num(d.lootChance) * 1000) / 10) + '%') : '(확률 기본값)';
    return what + ' ' + ch;
  }
  PDM.gameMobLoot = async cls => lootText(await PDM.gameMob(cls));
  const src = (d, k) => d.from && d.from[k] ? `  (${d.from[k]} 에서 이어받음)` : '';
  const rng = (r, d, k) => r ? `${r[0]} ~ ${r[1]}${src(d, k)}` : null;

  PDM.gameMobBox = function (c, st) {
    if (!c.game) return null;
    const body = h('div', { class: 'mt-3' }, h('div', { class: 'hint' }, '저장소에서 읽는 중…'));
    const box = h('details', { open: st ? st.gmob !== false : true, ontoggle: e => { if (st) st.gmob = e.target.open; }, class: 'm-0 mt-3' },
      h('summary', { class: 'pointer' }, h('b', {}, '게임 코드의 실제 값'), h('span', { class: 'hint' }, '  게임 저장소 소스에서 읽음 (읽기 전용) — "게임 원래 동작 그대로"일 때 게임에서 쓰이는 값')), body);
    PDM.gameMob(c.game).then(d => { body.textContent = '';
      if (!d) { body.append(h('div', { class: 'hint' }, G.repoOf() ? `게임 저장소에 actors/mobs/${String(c.game).replace(/\./g, '/')}.java 가 없습니다.` : '게임 저장소를 찾지 못해 읽을 수 없습니다.')); return; }
      [kv('이름', d.name || '(글자 없음)'), kv('설명', d.desc), kv('클래스', d.file + (d.parent ? `  — extends ${d.parent}` : '')),
        kv('체력 (HT)', d.hp ? d.hp + src(d, 'hp') : null), kv('공격 피해', rng(d.dmg, d, 'dmg')), kv('명중 (attackSkill)', d.atk ? d.atk + src(d, 'atk') : null),
        kv('회피 (defenseSkill)', d.defenseSkill ? d.defenseSkill + src(d, 'defenseSkill') : null), kv('방어 (drRoll)', rng(d.dr, d, 'dr')),
        kv('경험치 (EXP)', d.exp ? d.exp + (d.maxLvl ? ` · 영웅 레벨 ${d.maxLvl} 까지만 줌` : '') + src(d, 'exp') : null),
        kv('이동 속도', d.speed ? d.speed + ' 배' : null), kv('비행', d.flying ? '예' : null), kv('처음 상태', d.state),
        kv('속성', d.props.length ? d.props.map(p => (PROPS[p] || p) + ' (' + p + ')').join(', ') : null),
        kv('그림', d.sprite ? `sprites/${d.sprite}.java${src(d, 'sprite')}` : null),
        kv('전리품', lootText(d) + (d.loot ? `   — loot = ${d.loot}${d.lootChance ? ', lootChance = ' + d.lootChance : ''}${src(d, 'loot')}` : '')),
        ...d.lootFn.map(m => fold('전리품 코드 — ' + m.code.trim().split('\n')[0].trim().slice(0, 70), () => codeView(m.code, m.line))),
        fold(`코드 보기 — ${d.file} (${d.lines}줄)`, () => codeView(d.code, 1)),
        usageFold(String(d.cls).split('.').pop(), [d.file])].filter(Boolean).forEach(x => body.append(x)); });
    return box;
  };

  // ---------------------------------------------------------------- 층마다 나오는 몬스터 (MobSpawner)
  PDM.gameRotation = depth => memo('rot|' + depth, async () => {
    const rotFile = (PDM.GAME_SCAN && PDM.GAME_SCAN.mobRotation) || 'actors/mobs/MobSpawner.java';   // 9차: 파생작은 클래스 이름이 다를 수 있음 (ARK: MobRotation)
    const code = await read(rotFile); if (!code) return null;
    const s = strip(code), msg = await msgs();
    const std = method(s, /standardMobRotation\s*\([^)]*\)\s*\{/); if (!std) return null;
    let seg = caseBodies(std.body, String(depth))[0], fallback = false;
    if (seg === undefined) { const i = std.body.search(/default\s*:/); if (i < 0) return null; seg = std.body.slice(i).replace(/^(\s*(default|case\s+\w+)\s*:)+/, ''); const e = seg.search(/\bcase\s+\w+\s*:/); if (e >= 0) seg = seg.slice(0, e); fallback = true; }
    const count = {}; for (const m of seg.split(';')[0].matchAll(/(\w+)\.class/g)) count[m[1]] = (count[m[1]] || 0) + 1;
    const nm = c => fmt(msg['actors.mobs.' + lc(c) + '.name']) || c;
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    const rare = method(s, /void\s+addRareMobs\s*\([^)]*\)\s*\{/), rs = rare ? caseBodies(rare.body, String(depth))[0] : '';
    const rm = /Random\.Float\(\)\s*<\s*([\d.]+)f?[\s\S]*?add\(\s*(\w+)\.class/.exec(rs || '');
    const alts = [...s.matchAll(/RARE_ALTS\.put\(\s*(\w+)\.class\s*,\s*(\w+)\.class/g)].filter(m => count[m[1]]).map(m => `${nm(m[1])} → ${nm(m[2])}`);
    const ac = /altChance\s*=\s*([^;]+);/.exec(s);
    const raw = method(code, /standardMobRotation\s*\([^)]*\)\s*\{/);
    return { file: rotFile, depth, fallback, total, list: Object.entries(count).map(([c, n]) => ({ cls: c, name: nm(c), n, pct: Math.round(n / total * 100) })),
      rare: rm ? { cls: rm[2], name: nm(rm[2]), chance: Math.round(num(rm[1]) * 1000) / 10 } : null, alts, altChance: ac ? ac[1].trim() : '', code: raw ? raw.code : '', line: raw ? raw.line : 0 };
  });
  /** 몬스터 고르기 목록 [[ref, 표시]] — 프로젝트 몬스터 · 보스 캐릭터 + 게임 몬스터 (spd:<클래스>). 맵 "몬스터 스폰" · 드랍 테이블 "테마별 몬스터" */
  const GAME_MOBS = [['Rat', '쥐'], ['Albino', '알비노 쥐'], ['Gnoll', '놀 정찰병'], ['Crab', '하수도 게'], ['Slime', '하수도 슬라임'], ['Snake', '뱀'], ['Swarm', '파리 떼'],
    ['Skeleton', '해골'], ['Thief', '도둑'], ['Bandit', '강도'], ['DM100', 'DM-100'], ['Guard', '교도관'], ['Necromancer', '강령술사'],
    ['Bat', '흡혈 박쥐'], ['Brute', '놀 야만전사'], ['Shaman$RedShaman', '놀 주술사 (빨강)'], ['Spinner', '동굴 거미'], ['DM200', 'DM-200'],
    ['Ghoul', '드워프 구울'], ['Elemental$FireElemental', '불의 정령'], ['Warlock', '드워프 흑마법사'], ['Monk', '드워프 수도사'], ['Golem', '골렘'],
    ['Succubus', '서큐버스'], ['Eye', '악마의 눈'], ['Scorpio', '전갈'], ['RipperDemon', '찢는 악마']];
  PDM.mobRefOptions = () => [...PDM.store.all('char').filter(c => PDM.isHostile(c.kind) && c.enabled !== false).map(c => [c.id, c.name]),
    ...GAME_MOBS.map(([c, n]) => ['spd:' + c, `(게임) ${n}`])];
  PDM.gameSpawnBox = function (depth) {
    const body = h('span', {}, '읽는 중…');
    const box = h('div', { class: 'hint', style: { margin: '2px 0 6px', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '6px' } }, h('b', {}, `목록을 비우면 — 깊이 ${depth} 의 게임 몬스터: `), body);
    PDM.gameRotation(depth).then(r => { body.textContent = '';
      if (!r) { body.textContent = G.repoOf() ? `층별 몬스터 목록(${(PDM.GAME_SCAN && PDM.GAME_SCAN.mobRotation) || 'MobSpawner.java'})에서 읽지 못했습니다.` : '게임 저장소를 찾지 못했습니다.'; return; }
      body.append(r.list.map(x => `${x.name} ×${x.n} (${x.pct}%)`).join(', ') + (r.fallback ? '  — 이 깊이는 게임 코드에 따로 없어 기본(default) 목록을 씀' : ''));
      if (r.rare) box.append(h('div', {}, `드물게 ${r.rare.chance}% 확률로 ${r.rare.name} 이(가) 목록에 더해짐`));
      if (r.alts.length) box.append(h('div', {}, `희귀 변종으로 바뀜 (확률 ${r.altChance || '1/50'}): ${r.alts.join(', ')}`));
      if (r.code) box.append(fold(`코드 보기 — ${r.file.split('/').pop().replace(/\.java$/, '')}.standardMobRotation() (${r.file} : ${r.line})`, () => codeView(r.code, r.line)));
    });
    return box;
  };

  // ---------------------------------------------------------------- 지역별 방 수 (levels/<지역>Level.java)
  const LEVEL = { SEWER: 'SewerLevel', PRISON: 'PrisonLevel', CAVES: 'CavesLevel', CITY: 'CityLevel', HALLS: 'HallsLevel' };
  PDM.gameLevel = theme => memo('lvl|' + theme, async () => {
    const cls = LEVEL[String(theme || '').toUpperCase()]; if (!cls) return null;
    const code = await read('levels/' + cls + '.java'), reg = await read('levels/RegularLevel.java'); if (!code) return null;
    const pick = (src, name) => { const m = method(src, new RegExp('int\\s+' + name + '\\s*\\(\\s*boolean\\s+\\w+\\s*\\)\\s*\\{')); if (!m) return null;
      const note = (/\/\/\s*(.+)/.exec(m.code.split('\n').slice(1).join('\n')) || [])[1] || '', max = /if\s*\(\s*\w+\s*\)\s*return\s+(\d+)/.exec(m.body), r = [...m.body.matchAll(/return\s+([^;]+);/g)].pop();
      return { note: note.trim(), max: max ? +max[1] : null, expr: r ? r[1].trim() : '', code: m.code, line: m.line }; };
    const items = method(reg, /void\s+createItems\s*\(\s*\)\s*\{/), mobs = method(reg, /int\s+mobLimit\s*\(\s*\)\s*\{/) || method(reg, /int\s+nMobs\s*\(\s*\)\s*\{/);
    return { cls, file: 'levels/' + cls + '.java', std: pick(code, 'standardRooms'), spc: pick(code, 'specialRooms'), items, mobs };
  });
  PDM.gameLevelBox = function (theme) {
    const tn = (PDM.THEMES[String(theme || '').toUpperCase()] || {}).name || theme;
    const box = h('div', { class: 'hint', style: { margin: '6px 0', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '6px', textAlign: 'left' } }, h('b', {}, `블럭이 없을 때 게임이 만드는 구성 — ${tn}`));
    PDM.gameLevel(theme).then(d => {
      if (!d) { box.append(h('div', {}, G.repoOf() ? '이 테마의 Level 클래스를 저장소에서 찾지 못했습니다 (사용자 테마는 바탕 지역의 규칙을 따름).' : '게임 저장소를 찾지 못했습니다.')); return; }
      const line = (label, x) => x ? h('div', {}, `${label}: `, mono(x.expr), x.note ? `  — ${x.note}` : '', x.max ? ` (최대 ${x.max})` : '') : null;
      [line('일반 방 수', d.std), line('특수 방 수', d.spc),
        h('div', {}, '입구 · 출구 방 1개씩, 비밀 방은 지역마다 정해진 수를 층에 나눠 넣음 (SecretRoom.secretsForFloor), 배치는 고리 또는 8자 (LoopBuilder / FigureEightBuilder)'),
        h('div', {}, '아이템: 층마다 3개 60% · 4개 30% · 5개 10% (큰 층은 +2), 종류는 Generator.random()'),
        d.std ? fold(`코드 보기 — ${d.cls}.standardRooms() (${d.file} : ${d.std.line})`, () => codeView(d.std.code, d.std.line)) : null,
        d.spc ? fold(`코드 보기 — ${d.cls}.specialRooms() (${d.file} : ${d.spc.line})`, () => codeView(d.spc.code, d.spc.line)) : null,
        d.items ? fold(`코드 보기 — RegularLevel.createItems() (levels/RegularLevel.java : ${d.items.line})`, () => codeView(d.items.code, d.items.line)) : null].filter(Boolean).forEach(x => box.append(x)); });
    return box;
  };

  // ---------------------------------------------------------------- 상자류 (Heap.Type)
  const HEAP = {
    chest:    { type: 'CHEST', text: '층에 놓이는 아이템마다 20분의 5 확률로 상자에 담깁니다 (그중 일부는 미믹). 내용물은 Generator.random() 으로 뽑은 아이템 1개.' },
    locked:   { type: 'LOCKED_CHEST', text: '층 아이템이 유물이면 1/2, 강화할 수 있는 장비면 1/(4 − 강화 수치) 확률로 잠긴 상자가 되고, 같은 층에 황금 열쇠가 하나 더 놓입니다 (깊이 2부터 1/10 은 황금 미믹). 비밀 방 · 퀘스트 보상에도 쓰임.' },
    crystal:  { type: 'CRYSTAL_CHEST', text: '수정 금고 방(CrystalVaultRoom)에 2개가 놓이고 수정 열쇠 하나로 하나만 엽니다. 내용물은 방 코드가 정함.' },
    tomb:     { type: 'TOMB', text: '납골당 방(CryptRoom)의 보상 갑옷, 풀밭 무덤 방(GrassyGraveRoom)의 금화/아이템이 무덤에 담깁니다. 열면 망령이 나옴.' },
    skeleton: { type: 'SKELETON', text: '층에 놓이는 아이템마다 20분의 1 확률로 유해에 담기고, 저주받은 아이템이면 망령이 나옵니다. 구덩이 방 · 독가스 방 · 집단 무덤 방에도 쓰임.' }
  };
  PDM.gameHeapBox = function (kind) {
    const H = HEAP[kind]; if (!H) return null;
    return h('div', { class: 'hint', style: { margin: '2px 0 6px', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: '6px' } },
      h('div', {}, h('b', {}, '게임이 넣는 내용물 (원작 기준): '), H.text),
      fold(`이 저장소에서 Heap.Type.${H.type} 을 쓰는 곳`, async () => { const u = await PDM.gameUsages('Heap.Type.' + H.type, ['items/Heap.java']);
        if (!u.length) return h('div', {}, '쓰는 곳을 찾지 못했습니다.');
        return [h('div', {}, u.length + '곳'), ...u.slice(0, 30).map(x => h('div', { class: 'my-2' }, mono(x.file + ' : ' + x.line), codeView(x.text, x.from, x.line)))]; }));
  };
  PDM.gameHeapText = kind => (HEAP[kind] || {}).text || '';

  /** 영웅 선택 화면 글자를 입력 칸의 안내 글(placeholder)로 넣음. field: short | desc | unlock */
  PDM.gameHeroText = function (fieldEl, cls, field, prefix) {
    const ta = fieldEl && (fieldEl.matches && fieldEl.matches('textarea,input') ? fieldEl : fieldEl.querySelector('textarea,input'));
    if (ta && cls && PDM.gameHero) PDM.gameHero(cls).then(d => { const t = d && d.texts && d.texts[field]; if (t) { ta.placeholder = (prefix || '비우면 게임 글자: ') + t; ta.title = t; } });
    return fieldEl;
  };
  PDM.gameInfoClear = () => { Object.keys(cache).forEach(k => delete cache[k]); };
})();
