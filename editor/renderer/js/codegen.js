// ================================================================
//  코드 생성기 — 영웅/아이템 데이터 + 사용자 Java 코드 → 게임 저장소의 pdmaker/gen/*.java
//   · 영웅 heroes/<id>.json 의 code.* → gen/H_<id>.java  (MakerHeroCode 를 상속, 훅 메서드)
//   · 아이템 items/<id>.json 의 kind(melee·missile·armor) 또는 code.* → gen/I_<id>.java
//       melee → MeleeWeapon,  ranged → MakerBow(쏘기 · 발사체),  missile → MissileWeapon,  armor → Armor,  그 외 → MakerItem
//   생성된 파일은 게임과 함께 컴파일됩니다 (▶ 테스트 플레이 / 설치 때 자동으로 다시 만듦).
//   에디터 화면(미리보기)과 main.js(실제 생성)가 같은 파일을 씁니다.
// ================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PDM.codegen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PKG = 'com.shatteredpixel.shatteredpixeldungeon';

  /** 생성 파일에 기본으로 넣는 import (필요한 건 코드의 import 칸에 더 적기) */
  const IMPORTS = [
    `${PKG}.*`, `${PKG}.actors.*`, `${PKG}.actors.buffs.*`, `${PKG}.actors.hero.*`, `${PKG}.actors.mobs.*`,
    `${PKG}.items.*`, `${PKG}.items.weapon.*`, `${PKG}.items.weapon.melee.*`, `${PKG}.items.weapon.missiles.*`,
    `${PKG}.items.armor.*`, `${PKG}.items.potions.*`, `${PKG}.items.scrolls.*`, `${PKG}.items.food.*`,
    // 게임 아이템 폴더 전부 — new WandOfFireblast() · new RingOfHaste() 처럼 import 없이 바로 (이름이 겹치는 클래스 없음 — SPD 4.0 확인)
    `${PKG}.items.wands.*`, `${PKG}.items.rings.*`, `${PKG}.items.artifacts.*`, `${PKG}.items.stones.*`, `${PKG}.items.bags.*`, `${PKG}.items.keys.*`,
    `${PKG}.items.quest.*`, `${PKG}.items.spells.*`, `${PKG}.items.bombs.*`, `${PKG}.items.trinkets.*`, `${PKG}.items.potions.exotic.*`, `${PKG}.items.potions.brews.*`,
    `${PKG}.items.potions.elixirs.*`, `${PKG}.items.scrolls.exotic.*`, `${PKG}.items.weapon.missiles.darts.*`,
    `${PKG}.effects.*`, `${PKG}.levels.*`, `${PKG}.mechanics.*`, `${PKG}.scenes.*`, `${PKG}.sprites.*`,
    `${PKG}.utils.GLog`, `${PKG}.pdmaker.*`, `${PKG}.ui.BuffIndicator`, `${PKG}.ui.HeroIcon`,
    'com.watabou.utils.Random', 'com.watabou.utils.PathFinder', 'com.watabou.utils.Bundle', 'com.watabou.noosa.audio.Sample',
    'java.util.ArrayList', 'java.util.HashMap'
  ];

  /** 영웅 훅: 번호는 런타임(MakerHeroCode)의 번호와 같아야 함 */
  const HERO_HOOKS = [
    { key: 'onGameStart', id: 0, ret: 'void', params: 'Hero hero', doc: '새 게임을 시작할 때 한 번 (시작 아이템을 받은 뒤)' },
    { key: 'onFloorEnter', id: 6, ret: 'void', params: 'Hero hero', doc: '층(노드)에 들어올 때마다' },
    { key: 'onTurn', id: 7, ret: 'void', params: 'Hero hero', doc: '매 턴' },
    { key: 'onLevelUp', id: 8, ret: 'void', params: 'Hero hero, int lvl', doc: '레벨이 오를 때 (lvl = 새 레벨)' },
    { key: 'attackSkill', id: 1, ret: 'int', params: 'Hero hero, Char target, int value', val: 'value', doc: '명중 수치. value 를 바꾸거나 return' },
    { key: 'defenseSkill', id: 2, ret: 'int', params: 'Hero hero, Char enemy, int value', val: 'value', doc: '회피 수치' },
    { key: 'damageRoll', id: 3, ret: 'int', params: 'Hero hero, int value', val: 'value', doc: '공격 피해 (굴린 값)' },
    { key: 'drRoll', id: 4, ret: 'int', params: 'Hero hero, int value', val: 'value', doc: '피해 감소(방어) 굴림' },
    { key: 'speed', id: 5, ret: 'float', params: 'Hero hero, float value', val: 'value', doc: '이동 속도 배율' },
    { key: 'attackProc', id: 9, ret: 'int', params: 'Hero hero, Char enemy, int damage', val: 'damage', doc: '공격이 맞았을 때 (damage 를 바꾸면 적용)' },
    { key: 'defenseProc', id: 10, ret: 'int', params: 'Hero hero, Char enemy, int damage', val: 'damage', doc: '공격을 받았을 때' },
    { key: 'onKill', id: 11, ret: 'void', params: 'Hero hero, Mob mob', doc: '영웅이 몬스터를 쓰러뜨렸을 때' },
    { key: 'onGain', id: 14, ret: 'void', params: 'String kind, String id, Hero hero', doc: '전직·직업 능력을 고르거나, 특성 포인트를 올리거나, 패시브가 열렸을 때 (kind = subclass·ability·talent·passive)', entryOnly: true },
    { key: 'onUse', id: 15, ret: 'void', params: 'String kind, String id, Hero hero, int cell, Char target', doc: '직업 능력을 쓸 때 (효과가 나간 뒤 — cell = 고른 칸, target = 그 칸의 캐릭터)', entryOnly: true },
    { key: 'onAction', id: 13, ret: 'void', params: 'Hero hero, String id', doc: 'Special.button("id", "이름", 아이콘) 으로 만든 화면 오른쪽 행동 버튼을 눌렀을 때 (id 로 구분)' },
    { key: 'onTalentUp', id: 12, ret: 'void', params: 'Hero hero, String talent, int points', doc: '특성 포인트를 올렸을 때 (talent = 특성 id, points = 올린 뒤 포인트)' }
  ];

  /** 아이템 훅 (kind 별로 쓸 수 있는 것) */
  const ITEM_HOOKS = [
    { key: 'proc', kinds: ['melee', 'missile', 'ranged'], ret: 'int', params: 'Char attacker, Char defender, int damage', val: 'damage', doc: '이 무기로 맞혔을 때 (damage 를 바꾸면 적용)' },
    { key: 'armorProc', kinds: ['armor'], ret: 'int', params: 'Char attacker, Char defender, int damage', val: 'damage', doc: '이 갑옷을 입고 공격받았을 때' },
    { key: 'min', kinds: ['melee', 'missile', 'ranged'], ret: 'int', params: 'int lvl, int value', val: 'value', doc: '최소 피해 (lvl = 강화 수치)' },
    { key: 'max', kinds: ['melee', 'missile', 'ranged'], ret: 'int', params: 'int lvl, int value', val: 'value', doc: '최대 피해' },
    { key: 'drMin', kinds: ['armor'], ret: 'int', params: 'int lvl, int value', val: 'value', doc: '최소 방어' },
    { key: 'drMax', kinds: ['armor'], ret: 'int', params: 'int lvl, int value', val: 'value', doc: '최대 방어' },
    { key: 'onEquip', kinds: ['melee', 'ranged', 'armor'], ret: 'void', params: 'Hero hero', doc: '장착했을 때' },
    { key: 'onUnequip', kinds: ['melee', 'ranged', 'armor'], ret: 'void', params: 'Hero hero', doc: '장착을 풀었을 때' },
    { key: 'onPickUp', kinds: ['misc', 'melee', 'ranged', 'missile', 'armor', 'codex', 'grimoire'], ret: 'void', params: 'Hero hero', doc: '주웠을 때' },
    { key: 'desc', kinds: ['misc', 'melee', 'ranged', 'missile', 'armor', 'codex', 'grimoire'], ret: 'String', params: 'String value', val: 'value', doc: '설명 글 (value = 에디터에 쓴 설명)' }
  ];

  const safeId = id => String(id).replace(/[^A-Za-z0-9_]/g, '_');
  const heroClass = id => 'H_' + safeId(id);
  const itemClass = id => 'I_' + safeId(id);
  const lit = s => JSON.stringify(String(s == null ? '' : s));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const fnum = v => { const n = num(v, 0); return (Number.isInteger(n) ? n + '.0' : String(n)) + 'f'; };
  const has = s => typeof s === 'string' && s.trim().length > 0;
  const indent = (s, pad) => String(s || '').replace(/\r/g, '').split('\n').map(l => l.length ? pad + l : l).join('\n');
  const mark = (what, where) => `// ▼ [${what}] ${where} — 에디터에서 쓴 코드`;

  /** 값을 돌려주는 훅: 사용자 코드가 return 을 쓰지 않으면 끝에 return value; */
  function hookBody(code, h, pad) {
    let out = indent(code, pad);
    // 마지막 줄이 return 이 아니면 끝에 return value; (중간에만 return 이 있어도 — 예전엔 컴파일 오류였음)
    if (h.ret !== 'void' && !endsWithReturn(code)) out += `\n${pad}return ${h.val};`;
    return out;
  }
  /** 마지막 문장이 (조건 없는) return 인지 — 마지막 줄이 return 으로 시작 */
  function endsWithReturn(code) {
    const lines = String(code || '').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
    return lines.length > 0 && /^return\b/.test(lines[lines.length - 1]);
  }
  // ---- 아이템 클래스가 놓이는 폴더 = 분류/세부 종류 (pdmaker/gen/items/<분류>/<세부 종류>/I_<id>.java)
  const JAVA_WORDS = new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null'.split(' '));
  /** 분류·세부 종류 이름 → 자바 패키지 이름 조각 (영문 소문자·숫자·_). 한글처럼 못 쓰는 글자뿐이면 'c' + 글자 코드 */
  function pkgSeg(v) {
    const raw = String(v == null ? '' : v).trim(); if (!raw) return '';
    let out = raw.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (!out) out = 'c' + Array.from(raw).map(ch => ch.codePointAt(0).toString(36)).join('').slice(0, 24);
    if (/^[0-9]/.test(out) || JAVA_WORDS.has(out)) out = '_' + out;
    return out;
  }
  const itemSub = i => i.subtype !== undefined && i.subtype !== null ? i.subtype
    : i.kind === 'melee' ? 'melee' : i.kind === 'ranged' ? 'ranged' : i.kind === 'missile' ? 'missile' : i.kind === 'armor' ? 'armor' : i.kind === 'codex' ? ((i.codex || {}).type || 'melee') : '';
  /** ['items', 분류, 세부 종류] */
  const itemDirs = it => ['items', pkgSeg(it.category || 'misc') || 'misc', pkgSeg(itemSub(it))].filter(Boolean);
  /** gen 폴더 기준 파일 경로: items/weapon/melee/I_sword.java */
  const itemPath = it => [...itemDirs(it), itemClass(it.id) + '.java'].join('/');
  /** gen 패키지 뒤에 붙는 부분: .items.weapon.melee */
  const itemPkg = it => '.' + itemDirs(it).join('.');

  // 프로젝트 아이템 목록 (generate 가 정함, 편집기 미리보기는 PDM.store) — 생성 파일마다 아이템 클래스를 import 해서 new I_<id>() 를 바로 쓸 수 있게
  let projItems = null;
  const itemsNow = () => projItems || (typeof PDM !== 'undefined' && PDM.store && PDM.store.isOpen ? PDM.store.all('item') : []);
  function header(extraImports, what, sub) {
    if (sub) extraImports = `${PKG}.pdmaker.gen.*\n` + (extraImports || '');
    const itemImps = itemsNow().filter(it => it && it.id && itemNeedsClass(it)).map(it => `${PKG}.pdmaker.gen${itemPkg(it)}.${itemClass(it.id)}`);
    const imps = [...IMPORTS, ...itemImps, ...String(extraImports || '').split(/[\n;]+/).map(x => x.trim().replace(/^import\s+/, '')).filter(Boolean)];
    return `// 자동 생성 파일 — PDMaker 가 ${what} 데이터로 만듭니다. 직접 고치지 말고 에디터에서 고치세요.\n` +
      `package ${PKG}.pdmaker.gen${sub || ''};\n\n` + [...new Set(imps)].map(i => `import ${i};`).join('\n') + '\n\n';
  }

  // ---------------------------------------------------------------- 영웅의 전직·직업 능력·특성·패시브 코드
  /** 항목별 코드 훅: 이 항목이 켜져 있을 때만 (전직했을 때 · 그 능력을 골랐을 때 · 특성 포인트가 있을 때 · 패시브가 열렸을 때) */
  const ENTRY_HOOKS = ['onGain', 'onUse', 'onTurn', 'onKill', 'onLevelUp', 'attackSkill', 'defenseSkill', 'damageRoll', 'drRoll', 'speed', 'attackProc', 'defenseProc'];
  const ENTRY_KINDS = [
    { kind: 'subclass', list: 'subclasses', name: '전직', cond: id => `MakerAbilities.subclassId().equals(${lit(id)})` },
    { kind: 'ability', list: 'abilities', name: '직업 능력', cond: id => `MakerAbilities.abilityId().equals(${lit(id)})` },
    { kind: 'talent', list: 'talents', name: '특성', cond: id => `HeroRuntime.talent(${lit(id)}) > 0` },
    { kind: 'passive', list: 'passives', name: '패시브', cond: id => `HeroRuntime.passive(${lit(id)})` }
  ];
  const entryId = (k, x) => k.kind === 'passive' ? (x.id || x.name || '') : (x.id || '');
  /** 코드가 있는 항목 [{ k, x, id, fn }] */
  function codeEntries(hero) {
    const out = [];
    ENTRY_KINDS.forEach(k => (hero[k.list] || []).forEach((x, i) => {
      const c = x.code || {};
      if (!ENTRY_HOOKS.some(hk => has(c[hk]))) return;
      const id = entryId(k, x);
      out.push({ k, x, id, fn: `_${k.kind}${i}_${safeId(id)}` });
    }));
    return out;
  }
  const paramNames = params => params.split(',').map(p => p.trim().split(/\s+/).pop()).filter(Boolean);
  /** 항목 코드 본문: 값 훅은 return 을 안 쓰면 끝에 return value; (마지막 줄이 return 이면 붙이지 않음) */
  function entryBody(code, h, pad, pre) {
    let out = (pre ? pad + pre + '\n' : '') + indent(code, pad);
    if (h.ret !== 'void' && !endsWithReturn(code)) out += `\n${pad}return ${h.val};`;
    return out;
  }

  // ---------------------------------------------------------------- 영웅
  function heroSource(hero) {
    const code = hero.code || {};
    const name = heroClass(hero.id);
    const entries = codeEntries(hero);
    const entryFor = h => entries.filter(e => has((e.x.code || {})[h.key]));
    const used = HERO_HOOKS.filter(h => (!h.entryOnly && has(code[h.key])) || entryFor(h).length);
    const skills = codeCasts(hero);
    let s = header(code.imports, `영웅 「${hero.name || hero.id}」`);
    s += `@SuppressWarnings("unused")\npublic class ${name} extends MakerHeroCode {\n\n`;
    s += `\tpublic static final String ID = ${lit(hero.id)};\n`;
    s += `\tprivate static final boolean[] USED = new boolean[16];\n\tstatic {\n${used.map(h => `\t\tUSED[${h.id}] = true;   // ${h.key}`).join('\n')}\n\t}\n`;
    s += `\t@Override public boolean overrides(int hook) { return hook >= 0 && hook < USED.length && USED[hook]; }\n\n`;
    used.forEach(h => {
      const es = entryFor(h), args = paramNames(h.params).join(', ');
      let body = '';
      if (h.key === 'onGain' || h.key === 'onUse') {
        // 종류·id 로 나눔
        body += `\t\tswitch (kind + ":" + id) {\n` + es.map(e => `\t\t\tcase ${lit(e.k.kind + ':' + e.id)}: ${e.fn}_${h.key}(${args}); break;\n`).join('') + `\t\t}\n`;
      } else {
        // 켜져 있는 항목의 코드를 먼저 (값 훅은 값을 이어 받음), 그다음 영웅 코드
        es.forEach(e => {
          body += `\t\tif (${e.k.cond(e.id)}) ` + (h.ret === 'void' ? `${e.fn}_${h.key}(${args});\n` : `${h.val} = ${e.fn}_${h.key}(${args});\n`);
        });
        if (has(code[h.key])) body += `\t\t${mark('영웅 ' + hero.id, h.key)}\n` + hookBody(code[h.key], h, '\t\t') + '\n';
        else if (h.ret !== 'void') body += `\t\treturn ${h.val};\n`;
      }
      s += `\t@Override public ${h.ret} ${h.key}(${h.params}) {\n${body}\t}\n\n`;
      es.forEach(e => {
        const pre = e.k.kind === 'talent' ? `int points = HeroRuntime.talent(${lit(e.id)});   // 이 특성의 포인트` : '';
        s += `\t${mark('영웅 ' + hero.id + ' · ' + e.k.name + ' ' + (e.x.name || e.id), h.key)}\n\tprivate ${h.ret} ${e.fn}_${h.key}(${h.params}) {\n${entryBody(e.x.code[h.key], h, '\t\t', pre)}\n\t}\n\n`;
      });
    });
    if (skills.length) {
      s += `\t@Override public void effect(String id, int effectIndex, Hero hero, int cell, Char target) {\n\t\tswitch (id + "#" + effectIndex) {\n`;
      skills.forEach(([what, sk]) => (sk.effects || []).forEach((e, i) => {
        if (e.type !== 'code' || !has(e.code)) return;
        s += `\t\t\tcase ${lit(sk.id + '#' + i)}: {\n\t\t\t\t${mark(what + ' ' + sk.id, '효과 ' + (i + 1))}\n${indent(e.code, '\t\t\t\t')}\n\t\t\t\tbreak;\n\t\t\t}\n`;
      }));
      s += `\t\t}\n\t}\n\n`;
    }
    if (has(code.members)) s += `\t${mark('영웅 ' + hero.id, '추가 멤버')}\n${indent(code.members, '\t')}\n`;
    s += '}\n';
    return s;
  }
  /** 코드 효과가 있는 주문·직업 능력 [[종류, 정의]] */
  const codeCasts = hero => [...(hero.spells || hero.skills || []).map(x => ['주문', x]), ...(hero.abilities || []).map(x => ['직업 능력', x]),
    ...(hero.subclasses || []).filter(x => x.active && x.active.enabled).map(x => ['전직 액티브', Object.assign({}, x.active, { id: 'active_' + x.id })])]
    .filter(([, sk]) => (sk.effects || []).some(e => e.type === 'code' && has(e.code)));
  const heroNeedsClass = hero => HERO_HOOKS.some(h => has((hero.code || {})[h.key])) || has((hero.code || {}).members) || codeCasts(hero).length > 0 || codeEntries(hero).length > 0;

  // ---------------------------------------------------------------- 아이템
  const KIND_BASE = { melee: 'MeleeWeapon', ranged: 'MakerBow', missile: 'MissileWeapon', armor: 'Armor', misc: 'MakerItem', codex: 'MakerCodex', grimoire: 'MakerCodex.MakerGrimoire' };
  /** 데이터로 도는 종류 (MakerItem 계열: 이름·설명·값을 데이터에서 읽음) */
  const DATA_KINDS = ['misc', 'codex', 'grimoire'];
  /** 게임 아이템 상속(kind game): 바탕 클래스 경로로 훅 종류 추측 */
  const gameBaseKind = base => /^weapon\.melee\./.test(base || '') ? 'melee' : /^weapon\.missiles\./.test(base || '') ? 'missile' : /^armor\.(?!glyphs)/.test(base || '') ? 'armor' : 'misc';
  const hookKind = it => it.kind === 'game' ? gameBaseKind(it.base) : (KIND_BASE[it.kind] ? it.kind : 'misc');
  // 모든 프로젝트 아이템에 클래스를 만듦 — 아이템마다 게임 클래스가 따로 있어야 아이템 도감(Catalog)에 하나씩 오르고 저장·불러오기도 정확함
  const itemNeedsClass = it => !!(it && it.id);

  function itemSource(it) {
    if (it.kind === 'game') return gameItemSource(it);
    const kind = KIND_BASE[it.kind] ? it.kind : 'misc';
    const code = it.code || {};
    const name = itemClass(it.id);
    const w = it.weapon || {}, a = it.armor || {};
    const hk = key => { const h = ITEM_HOOKS.find(x => x.key === key); return h && h.kinds.includes(kind) && has(code[key]) ? h : null; };
    let s = header(code.imports, `아이템 「${it.name || it.id}」`, itemPkg(it));
    s += `@SuppressWarnings("unused")\npublic class ${name} extends ${KIND_BASE[kind]} implements GenSupport.Coded {\n\n`;
    s += `\tpublic static final String ID = ${lit(it.id)};\n\t@Override public String makerId() { return ID; }\n\n`;
    if (kind === 'armor') s += `\tpublic ${name}() { super(${num(a.tier, 1) | 0}); }\n\n`;
    // 초기값
    const init = [`image = GenSupport.image(ID, image);`];
    if (kind === 'melee') init.push(`tier = ${num(w.tier, 1) | 0};`, `DLY = ${fnum(num(w.delay, 1))};`, `RCH = ${num(w.reach, 1) | 0};`, `ACC = ${fnum(num(w.accuracy, 1))};`);
    if (kind === 'ranged') init.push(`tier = ${num(w.tier, 1) | 0};`, `DLY = ${fnum(num(w.delay, 1))};`, `ACC = ${fnum(num(w.accuracy, 1))};`);   // 쏘기 · 발사체는 MakerBow 가 데이터(ranged)로
    if (kind === 'missile') init.push(`tier = ${num(w.tier, 1) | 0};`, `baseUses = ${fnum(num(w.baseUses, 8))};`, `sticky = ${w.sticky === false ? 'false' : 'true'};`, `DLY = ${fnum(num(w.delay, 1))};`, `ACC = ${fnum(num(w.accuracy, 1))};`);
    const dk = DATA_KINDS.includes(kind);
    if (dk) init.push(`makerId = ID;`, `applyData();`);
    if (it.unique) init.push('unique = true;');
    if (it.cursed) init.push('cursed = true;');
    if (kind !== 'misc' && it.stackable && kind === 'missile') { /* 투척 무기는 원래 겹침 */ }
    s += `\t{\n${init.map(x => '\t\t' + x).join('\n')}\n\t}\n\n`;
    // 이름·설명
    if (kind === 'melee' || kind === 'missile' || kind === 'ranged') s += `\t@Override public String name() {\n\t\tString n = GenSupport.name(ID);\n\t\treturn enchantment != null && (cursedKnown || !enchantment.curse()) ? enchantment.name(n) : n;\n\t}\n`;
    if (kind === 'armor') s += `\t@Override public String name() {\n\t\tString n = GenSupport.name(ID);\n\t\treturn glyph != null && (cursedKnown || !glyph.curse()) ? glyph.name(n) : n;\n\t}\n`;
    if (!dk || hk('desc')) {
      if (hk('desc')) s += `\t${mark('아이템 ' + it.id, 'desc')}\n\t@Override public String desc() {\n\t\tString value = GenSupport.desc(ID);\n${hookBody(code.desc, hk('desc'), '\t\t')}\n\t}\n\n`;
      else s += `\t@Override public String desc() { return GenSupport.desc(ID); }\n\n`;
    }
    if (!dk) s += `\t@Override public int value() { return GenSupport.price(ID, super.value(), quantity); }\n\n`;
    // 수치
    // 데이터 수치(기본 + 강화당)가 있으면 그 식, 없으면 원래 계산. 갑옷 최대 방어에는 강화 방향(augment) 보정을 더함
    const dmgFn = (fn, base, perLvl, hook) => {
      const hasData = typeof base === 'number' && isFinite(base);
      if (!hasData && !hk(hook)) return '';
      const val = hasData ? `${num(base, 0) | 0} + lvl * ${num(perLvl, 0) | 0}${fn === 'DRMax' ? ' + augment.defenseFactor(lvl)' : ''}` : `super.${fn}(lvl)`;
      if (!hk(hook)) return `\t@Override public int ${fn}(int lvl) { return ${val}; }\n`;
      return `\t${mark('아이템 ' + it.id, hook)}\n\t@Override public int ${fn}(int lvl) {\n\t\tint value = ${val};\n${hookBody(code[hook], hk(hook), '\t\t')}\n\t}\n`;
    };
    if (kind === 'melee' || kind === 'missile' || kind === 'ranged') {
      s += dmgFn('min', w.min, w.minPerLvl, 'min') + dmgFn('max', w.max, w.maxPerLvl, 'max');
      if (num(w.str, 0) > 0) s += `\t@Override public int STRReq(int lvl) { return ${num(w.str, 0) | 0} + (super.STRReq(lvl) - super.STRReq(0)); }\n`;
      s += '\n';
    }
    if (kind === 'armor') {
      s += dmgFn('DRMin', a.drMin, a.drMinPerLvl, 'drMin') + dmgFn('DRMax', a.drMax, a.drMaxPerLvl, 'drMax');
      if (num(a.str, 0) > 0) s += `\t@Override public int STRReq(int lvl) { return ${num(a.str, 0) | 0} + (super.STRReq(lvl) - super.STRReq(0)); }\n`;
      s += '\n';
    }
    // 훅
    if (hk('proc')) s += `\t${mark('아이템 ' + it.id, 'proc')}\n\t@Override public int proc(Char attacker, Char defender, int damage) {\n\t\tdamage = super.proc(attacker, defender, damage);\n\t\ttry {\n${hookBody(code.proc, hk('proc'), '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "proc", e); return damage; }\n\t}\n\n`;
    if (hk('armorProc')) s += `\t${mark('아이템 ' + it.id, 'armorProc')}\n\t@Override public int proc(Char attacker, Char defender, int damage) {\n\t\tdamage = super.proc(attacker, defender, damage);\n\t\ttry {\n${hookBody(code.armorProc, hk('armorProc'), '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "armorProc", e); return damage; }\n\t}\n\n`;
    if (hk('onEquip')) s += `\t${mark('아이템 ' + it.id, 'onEquip')}\n\t@Override public boolean doEquip(Hero hero) {\n\t\tboolean ok = super.doEquip(hero);\n\t\tif (ok) try {\n${indent(code.onEquip, '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "onEquip", e); }\n\t\treturn ok;\n\t}\n\n`;
    if (hk('onUnequip')) s += `\t${mark('아이템 ' + it.id, 'onUnequip')}\n\t@Override public boolean doUnequip(Hero hero, boolean collect, boolean single) {\n\t\tboolean ok = super.doUnequip(hero, collect, single);\n\t\tif (ok) try {\n${indent(code.onUnequip, '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "onUnequip", e); }\n\t\treturn ok;\n\t}\n\n`;
    if (hk('onPickUp')) s += `\t${mark('아이템 ' + it.id, 'onPickUp')}\n\t@Override public boolean doPickUp(Hero hero, int pos) {\n\t\tboolean ok = super.doPickUp(hero, pos);\n\t\tif (ok) try {\n${indent(code.onPickUp, '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "onPickUp", e); }\n\t\treturn ok;\n\t}\n\n`;
    // 사용자 행동 (버튼)
    const acts = (it.actions || []).filter(x => has(x.id) && has(x.code));
    if (acts.length) {
      s += `\t@Override public ArrayList<String> actions(Hero hero) {\n\t\tArrayList<String> a = super.actions(hero);\n${acts.map(x => `\t\tif (GenSupport.cond(${lit(x.cond || '')})) a.add(${lit('PDM_' + x.id)});`).join('\n')}\n\t\treturn a;\n\t}\n`;
      s += `\t@Override public String actionName(String action, Hero hero) {\n\t\tswitch (action) {\n${acts.map(x => `\t\t\tcase ${lit('PDM_' + x.id)}: return ${lit(x.name || x.id)};`).join('\n')}\n\t\t}\n\t\treturn super.actionName(action, hero);\n\t}\n`;
      const def = acts.find(x => x.default);
      if (def) s += `\t@Override public String defaultAction() { return ${lit('PDM_' + def.id)}; }\n`;
      s += `\t@Override public void execute(Hero hero, String action) {\n\t\tsuper.execute(hero, action);\n\t\ttry {\n\t\t\tswitch (action) {\n`;
      acts.forEach(x => {
        s += `\t\t\t\tcase ${lit('PDM_' + x.id)}: {\n\t\t\t\t\t${mark('아이템 ' + it.id, '행동 ' + x.id)}\n${indent(x.code, '\t\t\t\t\t')}\n`;
        if (x.consume) s += `\t\t\t\t\tdetach(hero.belongings.backpack);\n`;
        if (num(x.time, 1) > 0) s += `\t\t\t\t\thero.spendAndNext(${fnum(num(x.time, 1))});\n`;
        s += `\t\t\t\t\tbreak;\n\t\t\t\t}\n`;
      });
      s += `\t\t\t}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, action, e); }\n\t}\n\n`;
    }
    if (has(code.members)) s += `\t${mark('아이템 ' + it.id, '추가 멤버')}\n${indent(code.members, '\t')}\n`;
    s += '}\n';
    return s;
  }

  /** 게임 아이템 상속: items.<base> 를 그대로 상속하고, 이름·설명·그림·가격은 비어 있으면 게임 것, 훅·행동·추가 멤버로 고침 */
  function gameItemSource(it) {
    const code = it.code || {};
    const name = itemClass(it.id);
    const base = String(it.base || 'Item').replace(/^items\./, '').replace(/^spd:/, '');
    const kind = gameBaseKind(base);
    const hk = key => { const h = ITEM_HOOKS.find(x => x.key === key); return h && h.kinds.includes(kind) && has(code[key]) ? h : null; };
    let s = header(code.imports, `아이템 「${it.name || it.id}」 (게임 ${base} 상속)`, itemPkg(it));
    s += `@SuppressWarnings("unused")\npublic class ${name} extends com.shatteredpixel.shatteredpixeldungeon.items.${base} implements GenSupport.Coded {\n\n`;
    s += `\tpublic static final String ID = ${lit(it.id)};\n\t@Override public String makerId() { return ID; }\n\n`;
    s += `\t{\n\t\timage = GenSupport.image(ID, image);\n\t}\n\n`;
    if (has(it.name) && it.name !== it.baseName) s += `\t@Override public String name() { return GenSupport.name(ID); }\n`;
    if (hk('desc')) s += `\t${mark('아이템 ' + it.id, 'desc')}\n\t@Override public String desc() {\n\t\tString value = ${has(it.desc) ? 'GenSupport.desc(ID)' : 'super.desc()'};\n${hookBody(code.desc, hk('desc'), '\t\t')}\n\t}\n\n`;
    else if (has(it.desc)) s += `\t@Override public String desc() { return GenSupport.desc(ID); }\n`;
    if (num(it.price, 0) > 0) s += `\t@Override public int value() { return GenSupport.price(ID, super.value(), quantity); }\n`;
    s += '\n';
    const w = { min: 'min', max: 'max' };
    ['min', 'max'].forEach(k => { if (hk(k)) s += `\t${mark('아이템 ' + it.id, k)}\n\t@Override public int ${k}(int lvl) {\n\t\tint value = super.${k}(lvl);\n${hookBody(code[k], hk(k), '\t\t')}\n\t}\n`; });
    [['drMin', 'DRMin'], ['drMax', 'DRMax']].forEach(([k, fn]) => { if (hk(k)) s += `\t${mark('아이템 ' + it.id, k)}\n\t@Override public int ${fn}(int lvl) {\n\t\tint value = super.${fn}(lvl);\n${hookBody(code[k], hk(k), '\t\t')}\n\t}\n`; });
    void w;
    if (hk('proc')) s += `\t${mark('아이템 ' + it.id, 'proc')}\n\t@Override public int proc(Char attacker, Char defender, int damage) {\n\t\tdamage = super.proc(attacker, defender, damage);\n\t\ttry {\n${hookBody(code.proc, hk('proc'), '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "proc", e); return damage; }\n\t}\n\n`;
    if (hk('armorProc')) s += `\t${mark('아이템 ' + it.id, 'armorProc')}\n\t@Override public int proc(Char attacker, Char defender, int damage) {\n\t\tdamage = super.proc(attacker, defender, damage);\n\t\ttry {\n${hookBody(code.armorProc, hk('armorProc'), '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "armorProc", e); return damage; }\n\t}\n\n`;
    if (hk('onEquip')) s += `\t${mark('아이템 ' + it.id, 'onEquip')}\n\t@Override public boolean doEquip(Hero hero) {\n\t\tboolean ok = super.doEquip(hero);\n\t\tif (ok) try {\n${indent(code.onEquip, '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "onEquip", e); }\n\t\treturn ok;\n\t}\n\n`;
    if (hk('onUnequip')) s += `\t${mark('아이템 ' + it.id, 'onUnequip')}\n\t@Override public boolean doUnequip(Hero hero, boolean collect, boolean single) {\n\t\tboolean ok = super.doUnequip(hero, collect, single);\n\t\tif (ok) try {\n${indent(code.onUnequip, '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "onUnequip", e); }\n\t\treturn ok;\n\t}\n\n`;
    if (hk('onPickUp')) s += `\t${mark('아이템 ' + it.id, 'onPickUp')}\n\t@Override public boolean doPickUp(Hero hero, int pos) {\n\t\tboolean ok = super.doPickUp(hero, pos);\n\t\tif (ok) try {\n${indent(code.onPickUp, '\t\t\t')}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, "onPickUp", e); }\n\t\treturn ok;\n\t}\n\n`;
    const acts = (it.actions || []).filter(x => has(x.id) && has(x.code));
    if (acts.length) {
      s += `\t@Override public ArrayList<String> actions(Hero hero) {\n\t\tArrayList<String> a = super.actions(hero);\n${acts.map(x => `\t\tif (GenSupport.cond(${lit(x.cond || '')})) a.add(${lit('PDM_' + x.id)});`).join('\n')}\n\t\treturn a;\n\t}\n`;
      s += `\t@Override public String actionName(String action, Hero hero) {\n\t\tswitch (action) {\n${acts.map(x => `\t\t\tcase ${lit('PDM_' + x.id)}: return ${lit(x.name || x.id)};`).join('\n')}\n\t\t}\n\t\treturn super.actionName(action, hero);\n\t}\n`;
      const def = acts.find(x => x.default);
      if (def) s += `\t@Override public String defaultAction() { return ${lit('PDM_' + def.id)}; }\n`;
      s += `\t@Override public void execute(Hero hero, String action) {\n\t\tsuper.execute(hero, action);\n\t\ttry {\n\t\t\tswitch (action) {\n`;
      acts.forEach(x => {
        s += `\t\t\t\tcase ${lit('PDM_' + x.id)}: {\n\t\t\t\t\t${mark('아이템 ' + it.id, '행동 ' + x.id)}\n${indent(x.code, '\t\t\t\t\t')}\n`;
        if (x.consume) s += `\t\t\t\t\tdetach(hero.belongings.backpack);\n`;
        if (num(x.time, 1) > 0) s += `\t\t\t\t\thero.spendAndNext(${fnum(num(x.time, 1))});\n`;
        s += `\t\t\t\t\tbreak;\n\t\t\t\t}\n`;
      });
      s += `\t\t\t}\n\t\t} catch (RuntimeException e) { GenSupport.error(ID, action, e); }\n\t}\n\n`;
    }
    if (has(code.members)) s += `\t${mark('아이템 ' + it.id, '추가 멤버')}\n${indent(code.members, '\t')}\n`;
    s += '}\n';
    return s;
  }

  /** 프로젝트 전체 → { '파일이름.java': 소스 } */
  function generate(heroes, items) {
    const out = {};
    projItems = items || [];
    (heroes || []).forEach(h => { if (h && h.id && heroNeedsClass(h)) out[heroClass(h.id) + '.java'] = heroSource(h); });
    const index = [];
    (items || []).forEach(it => { if (it && it.id && itemNeedsClass(it)) { out[itemPath(it)] = itemSource(it); index.push([itemClass(it.id), itemPkg(it).slice(1) + '.' + itemClass(it.id)]); } });
    // 클래스 찾기 표: 런타임(GenSupport)이 아이템 id 로 클래스를 찾을 때 씀 (분류를 옮기면 패키지가 바뀌므로)
    out['GenIndex.java'] = `// 자동 생성 파일 — PDMaker 가 만듭니다. 아이템 클래스가 어느 폴더(분류/세부 종류)에 있는지.\npackage ${PKG}.pdmaker.gen;\n\npublic class GenIndex {\n\tpublic static final String[][] ITEMS = {\n`
      + index.map(([a, b]) => `\t\t{ ${lit(a)}, ${lit(b)} },\n`).join('') + '\t};\n}\n';
    projItems = null;
    return out;
  }

  /** 생성 파일의 줄 번호 → 어느 영웅/아이템의 어느 코드인지 (컴파일 오류 안내용) */
  function locate(source, line) {
    const lines = String(source).split('\n');
    for (let i = Math.min(line - 1, lines.length - 1); i >= 0; i--) {
      const m = lines[i].match(/\/\/ ▼ \[(.+?)\] (.+?) — /);
      if (m) return { what: m[1], where: m[2], line: line - i - 1 };
    }
    return null;
  }

  /** 간단 검사 (컴파일 전에 에디터에서 바로 보이는 것만): 괄호 짝, 닫히지 않은 문자열 */
  function lint(code) {
    const src = String(code || ''); if (!src.trim()) return [];
    const out = [], stack = [], pair = { ')': '(', ']': '[', '}': '{' };
    let line = 1, i = 0;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === '\n') { line++; i++; continue; }
      if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
      if (c === '"' || c === "'") {
        const q = c; i++;
        while (i < src.length && src[i] !== q && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
        if (src[i] !== q) out.push({ line, msg: '닫히지 않은 ' + (q === '"' ? '문자열 "' : "문자 '") });
        i++; continue;
      }
      if ('([{'.includes(c)) stack.push({ c, line });
      else if (')]}'.includes(c)) {
        const t = stack.pop();
        if (!t) out.push({ line, msg: `여는 괄호 없이 ${c}` });
        else if (t.c !== pair[c]) out.push({ line, msg: `${t.line}번째 줄의 ${t.c} 와 ${c} 가 짝이 안 맞음` });
      }
      i++;
    }
    stack.forEach(t => out.push({ line: t.line, msg: `${t.c} 가 닫히지 않음` }));
    return out;
  }

  return { HERO_HOOKS, ITEM_HOOKS, ENTRY_HOOKS, ENTRY_KINDS, hookKind, gameBaseKind, IMPORTS, lint, generate, heroSource, itemSource, heroClass, itemClass, itemPath, itemPkg, pkgSeg, heroNeedsClass, itemNeedsClass, locate };
});
