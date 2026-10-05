// ================================================================
//  영웅 편집기 — 플레이어블 영웅 (heroes/<id>.json)
//   바탕 직업 · 그림 · 능력치 · 시작 인벤토리 · 주문(주문서) · 전직 · 직업 능력 · 게이지·원소 · 특성 · 패시브
//   (원본 HeroClass / Hero / Talent / ArmorAbility 구조를 데이터로 옮긴 것)
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;

  async function newHero() {
    const id = await PDM.ui.prompt('새 영웅 id (영문, 파일 이름이 됩니다)', '');
    if (!id) return;
    const clean = PDM.slugId(id);
    if (store.has('hero:' + clean)) { toast('같은 id 가 있습니다', 'bad'); return; }
    const hr = PDM.make.hero(clean); hr.name = id;
    store.add('hero:' + clean, hr, '영웅 추가');
    PDM.tabs.open('hero:' + clean);
  }
  /** id 바꾸기 — 시작 영웅 · 영웅 순서 · hero/heroId 칸에 적힌 같은 id 도 함께 고침 (생성 코드 파일 이름 H_<id> 도 따라 바뀜) */
  async function renameHero(id) {
    const n0 = await PDM.ui.prompt('새 영웅 id (영문 — 파일 이름 · 코드 클래스 이름이 됩니다)', id, '이미 이 영웅으로 진행 중인 게임 저장은 새 id 를 모르니 새로 시작하세요.');
    if (!n0) return;
    const n = PDM.slugId(n0);
    if (!n || n === id) return;
    if (store.has('hero:' + n)) { toast('같은 id 가 있습니다', 'bad'); return; }
    let refs = 0;
    const fix = o => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { const v = o[k]; if ((k === 'hero' || k === 'heroId') && v === id) { o[k] = n; refs++; } else if (v && typeof v === 'object') fix(v); } };
    store.transaction('영웅 id 바꾸기', () => {
      store.rename('hero:' + id, 'hero:' + n);
      store.edit('project', '영웅 id 바꾸기', p => { if (p.startHero === id) p.startHero = n; if (Array.isArray(p.heroOrder)) p.heroOrder = p.heroOrder.map(x => x === id ? n : x); });
      store.keys().forEach(k => { if (k === 'hero:' + n || k === 'project') return; const c = PDM.clone(store.get(k)); const before = refs; fix(c); if (refs > before) { refs = before; store.edit(k, '영웅 id 바꾸기', r => { fix(r); }); } });
    });
    PDM.tabs.close('hero:' + id); PDM.tabs.open('hero:' + n);
    toast(`id 를 「${n}」 로 바꿨습니다` + (refs ? ` (다른 곳 ${refs}개도 고침)` : ''), 'ok');
  }
  function dupHero(id) {
    const c = PDM.clone(store.get('hero:' + id)); let n = id + '_copy', k = 2;
    while (store.has('hero:' + n)) n = id + '_copy' + (k++);
    c.id = n; c.name += ' 사본'; store.add('hero:' + n, c, '영웅 복제'); PDM.tabs.open('hero:' + n);
  }

  /** 아이템 칸: 프로젝트 아이템 + 자주 쓰는 게임 아이템 자동완성, 직접 입력(spd:클래스) 가능 */
  function itemInput(key, path) {
    const i = h('input', { type: 'text', value: PDM.deepGet(store.get(key), path) || '', placeholder: '아이템 id 또는 spd:클래스 — 눌러서 목록' });
    i.addEventListener('change', () => PDM.ui.commit(key, path, i.value.trim(), '아이템', true));
    const v = i.value;
    const hint = store.has('item:' + v) ? PDM.refName('item', v) : v.startsWith('spd:') ? '게임 아이템 ' + (((Object.values(PDM.SPD_ITEM_GROUPS || {}).flat().find(x => 'spd:' + x.p === v)) || {}).n || '') : '';
    return PDM.ui.field('아이템', PDM.ui.combo(i, PDM.ui.itemOptions), hint);
  }

  /** 영웅 순서 (게임 영웅 선택 화면의 버튼 순서) — project.heroOrder, 없는 영웅은 뒤에 */
  function orderedHeroes() {
    const all = store.all('hero'), ord = (store.get('project') || {}).heroOrder || [];
    const idx = (c, i) => { const k = ord.indexOf(c.id); return k >= 0 ? k : 1000 + i; };
    return all.map((c, i) => [c, idx(c, i)]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  }
  function moveHero(id, d) {
    const ids = orderedHeroes().map(c => c.id), i = ids.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    store.edit('project', '영웅 순서', p => { p.heroOrder = ids; });
  }
  PDM.heroOrder = { orderedHeroes, moveHero };
  /** 원작 영웅 (id 가 바탕 직업 이름) — 선택 화면에서 게임 원래 글자·정보 창을 씀 */
  const vanillaHero = c => !!String(c.baseClass || '').trim() && String(c.id).toUpperCase() === String(c.baseClass).toUpperCase();
  /** 아이템 이름·그림 (프로젝트 아이템 / spd:게임 아이템) */
  function itemInfo(v) {
    if (store.has('item:' + v)) { const it = store.get('item:' + v); return { name: it.name || v, sprite: it.sprite, game: false }; }
    const g = String(v).startsWith('spd:') ? Object.values(PDM.SPD_ITEM_GROUPS || {}).flat().find(x => 'spd:' + x.p === v) : null;
    return g ? { name: g.n, sprite: { sheet: 'builtin:items', name: g.img }, game: true } : { name: v, sprite: null, missing: true };
  }
  /** 처음부터 아는 아이템 (감정됨): 목록에서 골라 + 로 추가, − 로 삭제 */
  function knownItemsField(key) {
    const list = (store.get(key).knownItems || []).slice();
    const inp = h('input', { type: 'text', placeholder: '아이템을 고르고 + 를 누르세요 (물약·주문서·반지·마법봉 등)' });
    const add = () => {
      const v = inp.value.trim(); if (!v) return;
      if (list.includes(v)) { toast('이미 목록에 있습니다', 'bad'); return; }
      store.edit(key, '처음부터 아는 아이템 추가', o => { o.knownItems = (o.knownItems || []).concat([v]); });
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(add, 0); } });
    const rows = list.map((v, i) => {
      const inf = itemInfo(v);
      const cv = h('canvas', { width: 16, height: 16, style: { imageRendering: 'pixelated', width: '24px', height: '24px' } });
      if (inf.sprite) PDM.assets.drawItemSprite(cv, inf.sprite, 1);
      return h('div', { class: 'known-row', style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 6px', borderBottom: '1px solid var(--line)' } },
        cv, h('b', { style: inf.missing ? { color: 'var(--bad)' } : {} }, inf.name), h('code', { class: 'hint' }, v),
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'btn xs danger', title: '목록에서 빼기', onclick: e => { e.preventDefault(); store.edit(key, '처음부터 아는 아이템 삭제', o => { o.knownItems.splice(i, 1); }); } }, '−'));
    });
    return h('div', { class: 'field' }, h('label', { class: 'fl' }, '처음부터 아는 아이템 (감정됨)'),
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, h('div', { style: { flex: 1 } }, PDM.ui.combo(inp, PDM.ui.itemOptions)),
        h('button', { class: 'btn sm pri', title: '목록에 추가', onclick: e => { e.preventDefault(); add(); } }, '+')),
      h('div', { style: { marginTop: '6px', border: '1px solid var(--line)', borderRadius: '4px' } }, rows.length ? rows : h('div', { class: 'hint', style: { padding: '6px' } }, '없음 — 게임을 시작할 때 감정된 상태로 아는 아이템이 없습니다')),
      h('small', { class: 'hint' }, '게임을 시작할 때부터 이름·효과를 아는(감정된) 아이템입니다. 원작은 직업마다 물약·주문서 하나씩.'));
  }

  function effectRow(key, p, e) {
    const { F, row } = PDM.ui;
    const def = PDM.SKILL_EFFECTS[e.type] || { fields: [] };
    const f = {
      on: () => F.select(key, [...p, 'on'], PDM.EFFECT_ON, { label: '누구에게' }),
      radius: () => F.num(key, [...p, 'radius'], { label: '반경', int: true, min: 0 }),
      min: () => F.num(key, [...p, 'min'], { label: '최소', int: true }),
      max: () => F.num(key, [...p, 'max'], { label: '최대', int: true }),
      perLevel: () => F.num(key, [...p, 'perLevel'], { label: '레벨당 +', int: true }),
      amount: () => F.num(key, [...p, 'amount'], { label: '양', int: true }),
      percent: () => F.num(key, [...p, 'percent'], { label: '최대 체력 %', int: true }),
      buff: () => F.select(key, [...p, 'buff'], PDM.SPD_BUFFS, { label: '효과' }),
      turns: () => F.num(key, [...p, 'turns'], { label: '턴', min: 1 }),
      power: () => F.num(key, [...p, 'power'], { label: '칸 수', int: true, min: 1 }),
      ref: () => F.select(key, [...p, 'ref'], [...store.all('char').map(c => [c.id, c.name]), ['spd:Rat', '게임: 쥐'], ['spd:Bee', '게임: 벌']], { label: '소환할 것' }),
      count: () => F.num(key, [...p, 'count'], { label: '수', int: true, min: 1 }),
      ally: () => F.bool(key, [...p, 'ally'], { label: '아군' }),
      event: () => F.ref(key, [...p, 'event'], 'event', { label: '이벤트' }),
      char: () => F.ref(key, [...p, 'char'], 'char', { label: '캐릭터(비우면 대상)' }),
      action: () => F.ref(key, [...p, 'action'], 'heartAction', { label: '마음 행동' })
    };
    const typeSel = F.select(key, [...p, 'type'], Object.fromEntries(Object.entries(PDM.SKILL_EFFECTS).map(([k, v]) => [k, v.name])), { label: '효과', rerender: true });
    if (e.type === 'code') return h('div', {}, row(typeSel),
      F.code(key, [...p, 'code'], { sig: 'void effect(String id, int effectIndex, Hero hero, int cell, Char target) {',
        doc: 'cell = 고른 칸, target = 그 칸의 캐릭터(없으면 null). 영웅 코드의 "추가 멤버"에 만든 변수·함수도 쓸 수 있습니다.' }));
    const chance = F.num(key, [...p, 'chance'], { label: '확률 %', int: true, min: 1, max: 100, def: 100 });
    return row(typeSel, ...def.fields.map(k => f[k]()), chance);
  }


  /** 영웅 코드 훅 묶음 */
  const HOOK_GROUPS = [
    ['진행', ['onGameStart', 'onFloorEnter', 'onTurn', 'onLevelUp', 'onKill', 'onTalentUp', 'onAction']],
    ['전투 수치', ['attackSkill', 'defenseSkill', 'damageRoll', 'drRoll', 'speed']],
    ['전투 반응', ['attackProc', 'defenseProc']],
    ['기타', ['members', 'imports']]
  ];
  const HOOK_LABEL = { onGameStart: '게임 시작', onFloorEnter: '층 입장', onTurn: '매 턴', onLevelUp: '레벨업', onKill: '처치', onTalentUp: '특성 올림', onAction: '행동 버튼',
    attackSkill: '명중', defenseSkill: '회피', damageRoll: '공격 피해', drRoll: '방어 굴림', speed: '이동 속도',
    attackProc: '공격 적중', defenseProc: '공격 받음', members: '추가 멤버', imports: 'import' };

  /** 코드에서 자주 쓰는 것 (영웅·아이템 공용) */
  PDM.codeApiRef = () => h('details', { class: 'api-ref' }, h('summary', { style: { cursor: 'pointer' } }, '자주 쓰는 게임 API 보기'),
    h('table', {}, [
      ['hero.HP / hero.HT', '현재 / 최대 체력'], ['hero.lvl, hero.STR, hero.pos', '레벨 · 힘 · 위치(칸 번호)'],
      ['hero.belongings.weapon() / armor()', '장착한 무기·갑옷'], ['Dungeon.level.mobs', '이 층의 몬스터 목록'], ['Dungeon.depth, Dungeon.gold', '깊이 · 골드'],
      ['Buff.affect(ch, Burning.class)', '상태 효과 (Burning, Poison, Bleeding, Chill, Frost, Paralysis, Roots, Blindness, Weakness, Vulnerable, Haste, Invisibility, Bless, Barkskin…)'],
      ['ch.damage(n, source)', '피해'], ['Random.Int(n), Random.IntRange(a, b), Random.Float()', '난수'],
      ['GLog.i / p / w / n("글")', '게임 메시지 (보통·좋음·경고·나쁨)'], ['ch.sprite.showStatus(CharSprite.POSITIVE, "글")', '머리 위 글자'],
      ['MakerItem.create("id")', '프로젝트 아이템 / "spd:클래스" 게임 아이템 만들기'],
      ['StoryState.sw("id") / setSw / var / setVar', '이벤트와 같이 쓰는 스위치·변수'], ['EventInterpreter.runEvent("id", null)', '이벤트 실행'],
      ['HeartSystem.applyAction("char", "TALK")', '마음 행동 적용'],
      ['Special.get/set/add("키", n)', '특수 기능 값 (게임에 저장됨)'], ['Special.show("키", "이름", BuffIndicator.FIRE, 최대, "설명")', '버프 칸에 아이콘+숫자로 보여 주기'],
      ['Special.button("id", "이름", HeroIcon.NONE)', '화면 오른쪽 행동 버튼 → 행동 버튼(onAction) 칸']
    ].map(([a, b]) => h('tr', {}, h('td', {}, h('code', {}, a)), h('td', {}, b)))),
    h('p', { class: 'hint' }, '원본 게임의 클래스(actors, items, buffs…)는 이미 import 되어 있습니다. 모드에만 있는 클래스는 import 칸에 적으세요.'));

  /** 특수 기능 예시 — 코드 칸에 넣어 주는 예 (게이지·스택·충전 버튼 같은 영웅만의 시스템) */
  const SPECIAL_TEMPLATES = [
    { name: '게이지 (과열식)', desc: '턴마다 오르는 게이지 — 높을수록 공격이 세지고, 가득 차면 주변에 폭발. 행동 버튼으로 식힘', code: {
      onGameStart: `Special.show("heat", "과열", BuffIndicator.FIRE, 100, "턴마다 오르고, 높을수록 공격이 세진다. 가득 차면 폭주한다.");
Special.color("heat", 0xFF6622);
Special.button("vent", "냉각", HeroIcon.ENDURE);`,
      onTurn: `int heat = Special.add("heat", 2, 0, 100);
if (heat >= 100) {
    GLog.n("과열 폭주!");
    for (Mob m : Dungeon.level.mobs.toArray(new Mob[0]))
        if (Dungeon.level.distance(hero.pos, m.pos) <= 2) m.damage(Random.IntRange(5, 10), hero);
    Special.set("heat", 40);
}`,
      damageRoll: `return Math.round(value * (1f + Special.get("heat") / 200f));   // 과열 100 이면 +50%`,
      onAction: `if (id.equals("vent")) {
    Special.set("heat", 0);
    GLog.p("열을 식혔다.");
    hero.spendAndNext(1f);
}` } },
    { name: '연속 공격 스택', desc: '맞힐 때마다 스택 +1 (최대 10), 스택만큼 피해 +, 3턴 동안 안 맞히면 사라짐', code: {
      members: `int idle = 0;`,
      onGameStart: `Special.show("combo", "연타", BuffIndicator.COMBO, 10, "적을 맞힐 때마다 쌓이고, 쌓인 만큼 피해가 늘어난다.");`,
      attackProc: `Special.add("combo", 1, 0, 10);
idle = 0;
return damage + Special.get("combo");`,
      onTurn: `if (++idle > 3 && Special.get("combo") > 0) Special.set("combo", 0);` } },
    { name: '충전 행동 버튼', desc: '적을 3마리 쓰러뜨리면 행동 버튼이 켜지고, 누르면 체력 회복', code: {
      onGameStart: `Special.show("charge", "투지", BuffIndicator.UPGRADE, 3, "적을 쓰러뜨리면 모인다. 가득 차면 오른쪽 버튼으로 쓴다.");`,
      onKill: `if (Special.add("charge", 1, 0, 3) >= 3) Special.button("rally", "재기", HeroIcon.LAY_ON_HANDS);`,
      onAction: `if (id.equals("rally")) {
    hero.HP = Math.min(hero.HT, hero.HP + hero.HT / 3);
    hero.sprite.showStatus(CharSprite.POSITIVE, "재기!");
    Special.set("charge", 0);
    Special.removeButton("rally");
    hero.spendAndNext(1f);
}` } }
  ];
  function insertTemplate(key, t) {
    store.edit(key, '특수 기능 예시: ' + t.name, o => {
      o.code = o.code || {};
      Object.entries(t.code).forEach(([k, v]) => { const cur = String(o.code[k] || '').trim(); o.code[k] = cur ? cur + '\n\n// ---- ' + t.name + '\n' + v : v; });
    });
    toast('「' + t.name + '」 예시를 코드 칸에 넣었습니다');
  }

  /** 전직·직업 능력·특성·패시브 항목의 코드 — 그 항목이 켜져 있을 때만 동작 (codegen ENTRY_HOOKS) */
  const ENTRY_INFO = {
    subclass: { what: '전직', on: '이 전직을 했을 때만', gain: '전직할 때 (한 번)' },
    ability: { what: '직업 능력', on: '이 능력을 골랐을 때만', gain: '왕관으로 고를 때 (한 번)' },
    talent: { what: '특성', on: '이 특성에 포인트가 있을 때만 — 코드 안에서 points = 이 특성의 포인트', gain: '포인트를 올릴 때마다 (points = 올린 뒤 포인트)' },
    passive: { what: '패시브', on: '이 패시브가 열린 뒤에만', gain: '열릴 때 (한 번)' }
  };
  const ENTRY_LABEL = { onGain: '얻을 때', onUse: '쓸 때', onTurn: '매 턴', onKill: '처치', onLevelUp: '레벨업', attackSkill: '명중', defenseSkill: '회피', damageRoll: '공격 피해', drRoll: '방어 굴림', speed: '이동 속도', attackProc: '공격 적중', defenseProc: '공격 받음' };
  const ENTRY_EXAMPLE = {
    subclass: { damageRoll: 'return value + hero.lvl / 3;   // 레벨에 따라 피해 +', onGain: 'hero.HT += 10; hero.HP += 10;\nGLog.p("몸이 단단해졌다!");' },
    ability: { onUse: 'Buff.affect(hero, Haste.class, 3f);   // 쓰고 나면 3턴 가속', defenseProc: 'return damage * 9 / 10;   // 받는 피해 -10%' },
    talent: { attackProc: 'if (Random.Int(10) < points) Buff.affect(enemy, Bleeding.class).set(points * 2);\nreturn damage;', onGain: 'GLog.p("특성 포인트: " + points);' },
    passive: { onTurn: 'if (hero.HP < hero.HT / 4) Buff.affect(hero, Haste.class, 1f);   // 체력 25% 미만이면 가속', damageRoll: 'return value + 1;' }
  };
  function entryCode(key, p, x, kind, st, i) {
    const { F } = PDM.ui;
    const info = ENTRY_INFO[kind];
    const code = x.code || {};
    const hooks = PDM.codegen.ENTRY_HOOKS.filter(k => k !== 'onUse' || kind === 'ability');
    const used = k => typeof code[k] === 'string' && code[k].trim();
    const sk = 'ec_' + kind + i, cur = st[sk] || (hooks.find(used) || 'onGain');
    const hk = PDM.codegen.HERO_HOOKS.find(y => y.key === cur);
    const doc = (cur === 'onGain' ? info.gain : hk.doc + ' — ' + info.on) + (hk.ret !== 'void' ? ` · return 을 안 쓰면 ${hk.val} 를 그대로 (다음 코드로 이어짐)` : '');
    const n = hooks.filter(used).length;
    const ex = (ENTRY_EXAMPLE[kind] || {})[cur];
    return h('details', { class: 'entry-code', open: !!st[sk + 'o'], ontoggle: e => { st[sk + 'o'] = e.target.open; }, style: { marginTop: '8px', borderLeft: '3px solid var(--accent)', paddingLeft: '8px' } },
      h('summary', { style: { cursor: 'pointer' } }, h('b', {}, '코드 (세부 동작)'), h('span', { class: 'hint' }, n ? `  ● ${n}개 칸에 코드 — ${hooks.filter(used).map(k => ENTRY_LABEL[k]).join(', ')}` : `  위 칸으로 부족하면 ${info.what}의 동작을 Java 로 직접 — ${info.on}`)),
      h('div', { class: 'code-tabs' }, hooks.map(k => h('button', { class: 'btn xs' + (k === cur ? ' on' : ''), onclick: e => { e.preventDefault(); st[sk] = k; st[sk + 'o'] = true; PDM.tabs.refresh(key); } }, (used(k) ? '● ' : '') + ENTRY_LABEL[k]))),
      F.code(key, [...p, 'code', cur], { sig: `${hk.ret} ${cur}(${hk.params}) {`, doc, rerender: true, placeholder: ex ? '// 예:\n// ' + ex.replace(/\n/g, '\n// ') : '// 여기에 Java 코드' }),
      ex && !used(cur) ? h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); PDM.ui.commit(key, [...p, 'code', cur], ex, '코드 예시', true); } }, '예시 넣기') : null,
      h('p', { class: 'hint' }, '영웅 코드(아래 "코드 (Java)")와 같은 클래스로 만들어집니다 — 영웅 코드의 추가 멤버·Special 도구·게임 API 를 그대로 쓸 수 있습니다. 값 훅(명중·피해 등)은 켜진 항목들의 코드를 차례로 거친 뒤 영웅 코드로 갑니다.'));
  }

  function heroCodeSection(key, c, st, ctx) {
    const { F } = PDM.ui;
    const cg = PDM.codegen;
    const code = c.code || {};
    const cur = st.hook || 'onKill';
    const used = k => typeof code[k] === 'string' && code[k].trim();
    const tabs = h('div', {}, HOOK_GROUPS.map(([g, keys]) => h('div', { class: 'code-tabs' }, h('span', { class: 'hint', style: { width: '64px' } }, g),
      keys.map(k => h('button', { class: 'btn xs' + (k === cur ? ' on' : ''), onclick: e => { e.preventDefault(); st.hook = k; ctx.refresh(); } }, (used(k) ? '● ' : '') + HOOK_LABEL[k])))));
    const hk = cg.HERO_HOOKS.find(x => x.key === cur);
    const body = hk
      ? F.code(key, ['code', cur], { sig: `${hk.ret} ${hk.key}(${hk.params}) {`, doc: hk.doc + (hk.ret !== 'void' ? ` — return 을 안 쓰면 ${hk.val} 를 그대로 돌려줍니다.` : ''), rerender: true })
      : cur === 'members'
        ? F.code(key, ['code', 'members'], { label: '클래스에 추가할 변수·함수', doc: '모든 훅·주문·능력의 코드 효과에서 쓸 수 있습니다. 예: private int kills = 0;  (저장되지 않으니 필요하면 StoryState.setVar 사용)', rows: 4, rerender: true })
        : F.code(key, ['code', 'imports'], { label: 'import (한 줄에 하나)', doc: '예: com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.aria.*', rows: 2, rerender: true });
    return [
      h('p', { class: 'hint' }, '게임의 Hero 클래스에 끼워 넣는 Java 코드입니다. 테스트 플레이 때 pdmaker/gen/' + cg.heroClass(c.id) + '.java 로 만들어져 게임과 함께 컴파일됩니다. 오류가 나도 게임은 멈추지 않고 경고만 뜹니다.'),
      h('div', { class: 'special-box', style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 10px', margin: '6px 0 10px' } },
        h('div', { style: { fontWeight: 600, marginBottom: '4px' } }, '특수 기능 만들기'),
        h('p', { class: 'hint', style: { margin: '0 0 6px' } }, '게이지·스택·충전·자세처럼 이 영웅만의 시스템은 코드로 만듭니다. Special 도구로 값을 저장하고(Special.get/set/add), 버프 칸에 아이콘+숫자로 보여 주고(Special.show), 화면 오른쪽 행동 버튼을 띄웁니다(Special.button → "행동 버튼" 칸의 onAction). 값은 게임 저장에 함께 저장됩니다. 아래 예시를 넣어 보고 고쳐 쓰세요.'),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, SPECIAL_TEMPLATES.map(t => h('button', { class: 'btn sm', title: t.desc, onclick: e => { e.preventDefault(); insertTemplate(key, t); } }, '+ ' + t.name)))),
      tabs, body,
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
        h('button', { class: 'btn sm', onclick: () => PDM.ui.codeView(cg.heroClass(c.id) + '.java', cg.heroSource(store.get(key))) }, '생성될 코드 보기'),
        h('span', { class: 'hint' }, cg.heroNeedsClass(c) ? '코드 있음 — 파일이 만들어집니다' : '코드가 없으면 파일을 만들지 않습니다')),
      PDM.codeApiRef()
    ];
  }

  const effName = e => (PDM.SKILL_EFFECTS[e.type] || {}).name || e.type;
  /** 주문·능력 한 줄 요약 */
  function castSummary(sk, kind) {
    const eff = (sk.effects || []).map(effName).join(' + ');
    const cost = kind === 'ability' ? `갑옷 충전 ${sk.chargeUse ?? 35}%` : `충전 ${sk.cost ?? 1}`;
    const lock = kind === 'spell' ? `${sk.tier || 1}단계 · Lv${sk.unlockLevel || 1}${sk.requiresTalent ? ' · 특성 필요' : ''}${sk.subclass ? ' · 전직 전용' : ''}${sk.ability ? ' · 능력 전용' : ''} · ` : '';
    return `${lock}${PDM.CAST_TARGETS[sk.target] || sk.target} · ${cost}${sk.cooldown ? ' · 대기 ' + sk.cooldown + '턴' : ''}${sk.heat ? ' · 게이지 ' + (sk.heat > 0 ? '+' : '') + sk.heat : ''} · ${eff || '효과 없음'}`;
  }
  /** 기본 아이콘 (런타임 MakerSpells.iconOf 와 같음) */
  const castIconDef = sk => sk.target === 'self' ? 42 : sk.target === 'cell' ? 17 : 19;
  /** 효과로 설명 문장 만들기 */
  function castAutoDesc(sk) {
    const on = e => ({ self: '자신', area: '주변 적', target: '대상' })[e.on || (e.type === 'heal' || e.type === 'shield' ? 'self' : 'target')];
    const parts = (sk.effects || []).map(e => {
      const ch = e.chance && e.chance < 100 ? ` (${e.chance}% 확률)` : '';
      const r = e.radius ? ` 반경 ${e.radius}` : '';
      switch (e.type) {
        case 'damage': return `${on(e)}${r}에게 ${e.min}~${e.max}${e.perLevel ? ` (+레벨당 ${e.perLevel})` : ''}${e.percent ? ` + 최대 체력의 ${e.percent}%` : ''} 피해${ch}`;
        case 'heal': return `${on(e)}의 체력을 ${[e.amount ? e.amount : '', e.percent ? `최대 체력의 ${e.percent}%` : ''].filter(Boolean).join(' + ') || 0} 회복${ch}`;
        case 'shield': return `${on(e)}에게 보호막 ${e.amount || 5}${e.percent ? ` + 최대 체력의 ${e.percent}%` : ''}${ch}`;
        case 'buff': return `${on(e)}${r}에게 ${PDM.SPD_BUFFS[e.buff] || e.buff} ${e.turns || 5}턴${ch}`;
        case 'knockback': return `${on(e)}${r}을(를) ${e.power || 2}칸 밀쳐냄${ch}`;
        case 'blink': return '고른 칸으로 순간 이동';
        case 'summon': return `${PDM.refName ? PDM.refName('char', e.ref) : e.ref} ${e.count || 1}마리 소환${e.ally === false ? '' : ' (아군)'}${ch}`;
        case 'gauge': return `게이지 ${e.amount > 0 ? '+' : ''}${e.amount || 0}`;
        case 'event': return '특별한 일이 일어난다';
        default: return '';
      }
    }).filter(Boolean);
    return parts.join('. ') + (parts.length ? '.' : '');
  }
  /** 효과 목록 편집 (주문·능력·코덱스·게이지 폭주·원소 공용) */
  function effectsEditor(key, path, o = {}) {
    return PDM.ui.listEditor(key, path, { addLabel: o.addLabel || '효과', compact: true, emptyText: o.emptyText, make: () => (o.make ? o.make() : { type: 'damage', on: 'target', min: 2, max: 5 }),
      render: (e, j, ep) => effectRow(key, ep, e) });
  }
  PDM.castEffectsEditor = effectsEditor;
  /** 능력치 목록 ({stat, value}) — 전직·게이지 단계·원소 */
  function statsEditor(key, path) {
    const { F, row } = PDM.ui;
    return PDM.ui.listEditor(key, path, { addLabel: '능력치', compact: true, make: () => ({ stat: 'damagePct', value: 10 }),
      render: (e, j, ep) => row(F.select(key, [...ep, 'stat'], PDM.HERO_STATS, { label: '능력치' }), F.num(key, [...ep, 'value'], { label: '값', int: true })) });
  }
  const statsText = l => (l || []).map(e => `${(PDM.HERO_STATS[e.stat] || e.stat).replace(/ \(.*\)/, '')} ${e.value}`).join(', ');

  /** 대상·사거리·연출·효과 (주문·직업 능력 공용 — 런타임 MakerCast) */
  function castFields(key, p, sk, kind) {
    const { F, row } = PDM.ui;
    return [
      row(F.select(key, [...p, 'target'], PDM.CAST_TARGETS, { label: '대상', rerender: true }), sk.target === 'self' ? null : F.num(key, [...p, 'range'], { label: '사거리(0=무제한)', int: true, min: 0 }),
        kind === 'ability' ? F.num(key, [...p, 'chargeUse'], { label: '갑옷 충전 소모 %', int: true, min: 0, max: 100, def: 35, rerender: true, hint: '원작 35 (충전은 약 500턴에 100%)' })
          : F.num(key, [...p, 'cost'], { label: '주문 충전 소모', int: true, min: 0, rerender: true }),
        kind === 'ability' ? null : F.num(key, [...p, 'cooldown'], { label: '재사용 대기(턴)', int: true, min: 0, rerender: true }),
        (store.get(key).gauge || {}).enabled ? F.num(key, [...p, 'heat'], { label: '게이지 변화', int: true, rerender: true, hint: '예전 게이지 기능 (과열 +)' }) : null),
      row(F.select(key, [...p, 'visual'], PDM.SKILL_VISUALS, { label: '날아가는 효과' }), F.bool(key, [...p, 'projectile'], { label: '벽·적에 막힘' }),
        F.num(key, [...p, 'time'], { label: '걸리는 턴', step: 0.5, min: 0 }), F.text(key, [...p, 'shout'], { label: '외치는 말' })),
      row(F.sound(key, [...p, 'sound'], { label: '쓸 때 소리', kind: 'se', empty: '(기본 소리)' }), F.sound(key, [...p, 'hitSound'], { label: '맞을 때 소리', kind: 'se', empty: '(기본 소리)' })),
      h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '효과 (위에서부터 차례로)'),
      effectsEditor(key, [...p, 'effects'])];
  }
  /** 이 주문/능력을 바꾸는 특성 */
  function talentMods(c, id) {
    const mods = (c.talents || []).flatMap(t => (t.effects || []).filter(e => (e.type === 'spell' && (e.spell === id || e.spell === '*')) || (e.type === 'unlockSpell' && e.spell === id)).map(e => [t, e]));
    return mods.length ? h('div', { class: 'hint' }, '특성: ' + mods.map(([t, e]) => e.type === 'unlockSpell' ? `「${t.name}」으로 배움` : `「${t.name}」 ${PDM.SKILL_FIELDS[e.field] || e.field} ${e.perPoint > 0 ? '+' : ''}${e.perPoint}/p`).join(' · ')) : null;
  }
  const iconCanvas = idx => PDM.drawIcon(h('canvas', { style: { imageRendering: 'pixelated', verticalAlign: 'middle', marginRight: '4px' } }), 'hero', idx, 1);

  /** 주문 — ClericSpell · HolyTome · WndClericSpells */
  function spellSection(key, c, st) {
    const { F, row, listEditor } = PDM.ui;
    const subs = (c.subclasses || []).map(x => [x.id, x.name]), abs = (c.abilities || []).map(x => [x.id, x.name]);
    return [
      h('div', { class: 'hint', style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '6px 8px', marginBottom: '6px' } },
        h('b', {}, '주문이란? '), '영웅이 직접 골라 쓰는 기술(마법·기술)입니다. 영웅은 게임을 시작할 때 "주문서" 아이템을 하나 받고, 주문서를 열면 여기 만든 주문 목록이 나옵니다. 주문을 쓰면 주문서의 충전이 줄고, 시간이 지나면 다시 찹니다 (원작 성직자의 성서와 같은 방식). 주문이 하나도 없으면 주문서도 주지 않습니다.'),
      h('p', { class: 'hint' }, '원작 성직자처럼 영웅이 처음부터 "주문서"를 가지고, 주문서의 충전을 써서 주문을 겁니다. 주문은 1~4단계로 나뉘고 조건(레벨·특성·전직·직업 능력)을 채운 것만 주문 창에 나옵니다. 게임: 주문서 → 주문 창(아이콘을 누르면 시전, 길게 누르면 퀵슬롯 빠른 시전), 영웅 정보 창의 특성 탭 위쪽에도 나옵니다.'),
      row(F.bool(key, ['spellbook', 'enabled'], { label: '주문서 주기', def: true, rerender: true }), F.text(key, ['spellbook', 'name'], { label: '주문서 이름' }),
        F.icon(key, ['spellbook', 'image'], 'item', { label: '주문서 그림 (게임 아이템 그림 · 파일 지정 · 그리기)', def: ((PDM.SPD_ITEM_SPRITES || {})[PDM.gameMod2 ? 'mod2' : 'vanilla'] || {}).MASTERY ?? 62 }),
        F.num(key, ['spellbook', 'charges'], { label: '최대 충전', int: true, min: 0 }), F.num(key, ['spellbook', 'rechargeTurns'], { label: '1 충전에 걸리는 턴', int: true, min: 1 })),
      F.textarea(key, ['spellbook', 'desc'], { label: '주문서 설명', rows: 2 }),
      listEditor(key, ['spells'], {
        addLabel: '주문', emptyText: '주문이 없습니다',
        make: () => PDM.make.spell(),
        render: (sk, i, p) => h('details', { open: !!st['sp' + i], ontoggle: e => { st['sp' + i] = e.target.open; } },
          h('summary', { style: { cursor: 'pointer' } }, iconCanvas(sk.icon ?? castIconDef(sk)), h('b', {}, sk.name || sk.id), h('span', { class: 'hint' }, '  ' + castSummary(sk, 'spell'))),
          row(F.text(key, [...p, 'name'], { label: '이름', rerender: true }), F.text(key, [...p, 'id'], { label: 'id', transform: v => PDM.slugId(v) }),
            F.select(key, [...p, 'tier'], { 1: '1단계', 2: '2단계', 3: '3단계', 4: '4단계' }, { label: '단계 (주문 창의 줄)', number: true, rerender: true }),
            F.icon(key, [...p, 'icon'], 'hero', { label: '아이콘 (게임 아이콘 · 파일 지정 · 그리기)', def: castIconDef(sk) })),
          F.textarea(key, [...p, 'desc'], { label: '설명', rows: 2 }),
          h('div', {}, h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); PDM.ui.commit(key, [...p, 'desc'], castAutoDesc(sk), '주문 설명 자동'); } }, '효과로 설명 만들기'),
            h('span', { class: 'hint' }, '  게임의 정보 창에는 설명 아래 충전·대기·효과 수치(특성 보정 포함)가 자동으로 붙습니다.')),
          h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '배우는 조건 (모두 만족하면 주문 창에 나옴)'),
          row(F.num(key, [...p, 'unlockLevel'], { label: '레벨', int: true, min: 1, rerender: true }),
            F.select(key, [...p, 'requiresTalent'], (c.talents || []).map(x => [x.id, x.name]), { label: '필요한 특성', empty: '(없음)', rerender: true }),
            sk.requiresTalent ? F.num(key, [...p, 'requiresPoints'], { label: '특성 포인트 이상', int: true, min: 1 }) : null,
            F.select(key, [...p, 'subclass'], subs, { label: '이 전직만', empty: '(모두)', rerender: true }),
            F.select(key, [...p, 'ability'], abs, { label: '이 직업 능력만', empty: '(모두)', rerender: true })),
          F.cond(key, [...p, 'cond'], { label: '쓸 수 있는 조건 (비우면 항상)' }),
          talentMods(c, sk.id),
          ...castFields(key, p, sk, 'spell'))
      })];
  }

  /** 전직 — HeroSubClass · TengusMask · WndChooseSubclass */
  function subclassSection(key, c, st) {
    const { F, row, listEditor } = PDM.ui;
    return [
      PDM.gameHeroBox(c, 'subs', !(c.subclasses || []).length, st),
      h('p', { class: 'hint' }, '원작처럼 텐구를 쓰러뜨리면 나오는 "텐구의 가면"을 쓰면 이 목록에서 하나를 고릅니다 (이벤트 명령 "전직 고르기"로도 열 수 있음). 전직하면 특성 3단계가 열리고, "이 전직만" 표시한 주문·특성이 나옵니다. 비워 두면 위 상자의 게임 원래 전직을 그대로 씁니다.'),
      listEditor(key, ['subclasses'], {
        addLabel: '전직', emptyText: '프로젝트 전직이 없습니다 — 위 상자의 게임 원래 전직이 그대로 쓰입니다',
        make: () => PDM.make.subclass(),
        render: (x, i, p) => h('details', { open: !!st['sc' + i], ontoggle: e => { st['sc' + i] = e.target.open; } },
          h('summary', { style: { cursor: 'pointer' } }, iconCanvas(x.icon || 0), h('b', {}, x.name || x.id), h('span', { class: 'hint' }, '  ' + (x.shortDesc || '') + (x.base ? ` · 게임 전직 ${x.base}` : '') + ((x.effects || []).length ? ' · ' + statsText(x.effects) : ''))),
          row(F.text(key, [...p, 'name'], { label: '이름', rerender: true }), F.text(key, [...p, 'id'], { label: 'id (조건식: hero.subclass)', transform: v => PDM.slugId(v), rerender: true }),
            F.icon(key, [...p, 'icon'], 'hero', { label: '아이콘 (게임 아이콘 · 파일 지정 · 그리기)', def: 0 }),
            F.select(key, [...p, 'base'], PDM.gameSubclasses(), { label: '게임 전직 효과도 켜기', empty: '(없음)', rerender: true, hint: '예: BERSERKER 면 원작 광전사의 분노가 함께 동작. 바탕 직업에 맞는 것을 고르세요' })),
          F.text(key, [...p, 'shortDesc'], { label: '한 줄 설명 (고르는 창의 버튼)' }),
          F.textarea(key, [...p, 'desc'], { label: '설명', rows: 2 }),
          h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '전직하면 붙는 능력치'),
          statsEditor(key, [...p, 'effects']),
          entryCode(key, p, x, 'subclass', st, i),
          activeEditor(key, [...p, 'active'], x))
      })];
  }


  /** 전직 액티브 — 조건을 채우면 게임 화면 오른쪽 행동 버튼이 켜지고, 누르면 효과 (MakerActive) */
  const ACTIVE_TRIGGERS = { kill: '적을 처치하면', hit: '공격이 맞으면', damaged: '공격을 받으면', lowHp: '체력이 낮아지면', always: '항상 (대기 시간마다)', code: '코드로만 (MakerActive.ready())' };
  function activeEditor(key, p, sub) {
    const { F, row } = PDM.ui;
    const a = sub.active || {};
    const out = [h('div', { class: 'fl', style: { margin: '10px 0 2px' } }, '전직 액티브 (행동 버튼)'),
      F.bool(key, [...p, 'enabled'], { label: '이 전직에 액티브 버튼 쓰기 — 조건을 채우면 오른쪽 행동 버튼이 켜지고, 누르면 효과', rerender: true })];
    if (!a.enabled) return h('div', {}, ...out);
    out.push(
      row(F.text(key, [...p, 'name'], { label: '버튼 이름', rerender: true }), F.icon(key, [...p, 'icon'], 'hero', { label: '아이콘', def: 0 }),
        F.text(key, [...p, 'color'], { label: '버튼 색 #rrggbb', placeholder: '#ffb35c' })),
      F.text(key, [...p, 'desc'], { label: '설명 (버프 창)' }),
      row(F.select(key, [...p, 'trigger'], ACTIVE_TRIGGERS, { label: '켜지는 조건', rerender: true }),
        ['kill', 'hit', 'damaged', 'code'].includes(a.trigger || 'kill') ? F.num(key, [...p, 'need'], { label: '몇 번 채우면', int: true, min: 1, def: 1 }) : null,
        (a.trigger === 'lowHp') ? F.num(key, [...p, 'hpPct'], { label: '체력 % 이하', int: true, min: 1, max: 99, def: 30 }) : null,
        F.num(key, [...p, 'window'], { label: '켜진 뒤 쓸 수 있는 턴 (0 = 쓸 때까지)', int: true, min: 0, def: 0 }),
        F.num(key, [...p, 'cooldown'], { label: '쓴 뒤 대기 턴', int: true, min: 0, def: 0 })),
      row(F.text(key, [...p, 'message'], { label: '켜질 때 문구 (비우면 「이름」 준비!)' }), F.sound(key, [...p, 'readySound'], { label: '켜질 때 소리', kind: 'se', empty: '(없음)' })),
      h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '누르면'),
      row(F.select(key, [...p, 'target'], PDM.CAST_TARGETS, { label: '대상', rerender: true }), a.target && a.target !== 'self' ? F.num(key, [...p, 'range'], { label: '사거리(0=무제한)', int: true, min: 0 }) : null,
        F.select(key, [...p, 'visual'], PDM.SKILL_VISUALS, { label: '날아가는 효과' }), F.num(key, [...p, 'time'], { label: '걸리는 턴', step: 0.5, min: 0 }), F.text(key, [...p, 'shout'], { label: '외치는 말' })),
      row(F.sound(key, [...p, 'sound'], { label: '쓸 때 소리', kind: 'se', empty: '(기본 소리)' }), F.sound(key, [...p, 'hitSound'], { label: '맞을 때 소리', kind: 'se', empty: '(기본 소리)' })),
      effectsEditor(key, [...p, 'effects'], { addLabel: '효과', emptyText: '효과가 없습니다 — 예: "효과(버프)" 로 자신에게 가속·분노, "코드" 로 직접', make: () => ({ type: 'buff', on: 'self', buff: 'Haste', turns: 5 }) }),
      h('p', { class: 'hint' }, '효과 종류 "코드" 는 영웅 코드 클래스에 들어가 Java 로 직접 동작합니다 (case "active_' + (sub.id || '전직id') + '#번호"). 영웅 코드의 훅(적 처치 onKill 등)에서 MakerActive.ready() 로 켜기 · MakerActive.add(1) 로 진행 · MakerActive.isReady() · MakerActive.use() 도 쓸 수 있습니다.'));
    return h('div', { class: 'active-box', style: { borderLeft: '3px solid var(--gold)', paddingLeft: '8px', marginTop: '6px' } }, ...out);
  }
  /** 직업 능력 — ArmorAbility · KingsCrown · ClassArmor */
  function abilitySection(key, c, st) {
    const { F, row, listEditor } = PDM.ui;
    return [
      PDM.gameHeroBox(c, 'abilities', !(c.abilities || []).length, st),
      h('p', { class: 'hint' }, '원작처럼 "왕의 왕관"을 쓰면 이 목록에서 하나를 골라 입은 갑옷이 직업 갑옷이 되고, 갑옷의 충전(0~100%)을 써서 발동합니다 (이벤트 명령 "직업 능력 고르기"로도 열 수 있음). 고르면 특성 4단계가 열립니다. 원작은 셋 중 하나. 비워 두면 위 상자의 게임 원래 능력을 그대로 씁니다.'),
      listEditor(key, ['abilities'], {
        addLabel: '직업 능력', emptyText: '프로젝트 직업 능력이 없습니다 — 위 상자의 게임 원래 능력이 그대로 쓰입니다',
        make: () => PDM.make.ability(),
        render: (x, i, p) => h('details', { open: !!st['ab' + i], ontoggle: e => { st['ab' + i] = e.target.open; } },
          h('summary', { style: { cursor: 'pointer' } }, iconCanvas(x.icon ?? castIconDef(x)), h('b', {}, x.name || x.id), h('span', { class: 'hint' }, '  ' + castSummary(x, 'ability'))),
          row(F.text(key, [...p, 'name'], { label: '이름', rerender: true }), F.text(key, [...p, 'id'], { label: 'id (조건식: hero.ability)', transform: v => PDM.slugId(v), rerender: true }),
            F.icon(key, [...p, 'icon'], 'hero', { label: '아이콘 (게임 아이콘 · 파일 지정 · 그리기)', def: castIconDef(x) })),
          F.text(key, [...p, 'shortDesc'], { label: '한 줄 설명 (왕관 창의 버튼)' }),
          F.textarea(key, [...p, 'desc'], { label: '설명', rows: 2 }),
          h('div', {}, h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); PDM.ui.commit(key, [...p, 'desc'], castAutoDesc(x), '능력 설명 자동'); } }, '효과로 설명 만들기')),
          talentMods(c, x.id),
          ...castFields(key, p, x, 'ability'),
          entryCode(key, p, x, 'ability', st, i))
      })];
  }

  /** 게이지 · 원소 — mod-2 NewOverHeat */
  const ARIA_GAUGE = () => ({ enabled: true, name: '과열', max: 100, buffIcon: 2, perTurn: 0, sameElement: 2, afterUse: 2, idle: 1, recentTurns: 3,
    levels: [{ at: 1, name: '1단계', desc: '', effects: [] }, { at: 25, name: '2단계', desc: '코덱스 피해 +10%', effects: [{ stat: 'codexPct', value: 10 }] },
      { at: 50, name: '3단계', desc: '코덱스 피해 +20%, 받는 피해 +10%', effects: [{ stat: 'codexPct', value: 20 }, { stat: 'takenPct', value: 10 }] },
      { at: 75, name: '4단계', desc: '코덱스 피해 +30%, 받는 피해 +20%', effects: [{ stat: 'codexPct', value: 30 }, { stat: 'takenPct', value: 20 }] }],
    overflow: { enabled: true, delay: 4, resetTo: 60, effects: [{ type: 'damage', on: 'area', radius: 3, min: 6, max: 12, perLevel: 1 }, { type: 'damage', on: 'self', min: 0, max: 0, percent: 25 }, { type: 'buff', on: 'self', buff: 'Paralysis', turns: 1 }] },
    elements: [
      { id: 'fire', name: '불', color: '#E24F2E', icon: 0, desc: '공격 피해 +10%', effects: [{ stat: 'damagePct', value: 10 }], onSwitch: [] },
      { id: 'water', name: '물', color: '#05AAD3', icon: 0, desc: '받는 피해 -10%', effects: [{ stat: 'takenPct', value: -10 }], onSwitch: [] },
      { id: 'earth', name: '땅', color: '#F5CB3F', icon: 0, desc: '바꾸면 최대 체력 5% 보호막', effects: [{ stat: 'armor', value: 1 }], onSwitch: [{ type: 'shield', on: 'self', amount: 0, percent: 5 }] },
      { id: 'wind', name: '바람', color: '#14EA83', icon: 0, desc: '회피 +3', effects: [{ stat: 'evasion', value: 3 }], onSwitch: [] }],
    switchCool: 25, switchCooldown: 0, replaceNative: ['NewOverHeat'] });
  /** 캐릭터 선택 화면: 일러스트(그림 한 장 또는 시트 애니메이션) · 배치 · 버튼 아이콘 + 미리보기 */
  /** 기본: 선택 화면 · 정보 창 글자 (게임에서 실제로 보이는 글) */
  function selectTextFields(key, c) {
    const { F } = PDM.ui;
    return [
      PDM.gameHeroText(F.textarea(key, ['select', 'desc'], { label: '짧은 설명 (이름 아래)', rows: 2, placeholder: vanillaHero(c) ? '(게임 글자 actors.hero.heroclass.' + c.id + '_desc_short)' : (c.desc || '(영웅 설명)') }), vanillaHero(c) ? c.baseClass : '', 'short'),
      PDM.gameHeroText(F.textarea(key, ['select', 'info'], { label: '정보 창 설명 (ⓘ 버튼 · 선택된 영웅을 한 번 더 누를 때)', rows: 3, placeholder: vanillaHero(c) ? '(게임 글자 actors.hero.heroclass.' + c.id + '_desc + 시작 아이템 · 전직 탭)' : (c.desc || '(영웅 설명)') }), vanillaHero(c) ? c.baseClass : '', 'desc', '비우면 게임의 직업 정보 창 (정보 · 시작 아이템 · 전직 탭). 정보 글: '),
      h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
        h('button', { class: 'btn xs', title: '글 칸에서 글자를 끌어 고른 뒤 누르면 _밑줄_ 로 감싸 노란색 강조로 만듭니다', onmousedown: e => {
          e.preventDefault();   // 글 칸의 선택이 풀리지 않게
          const ta = document.activeElement; if (!ta || !/TEXTAREA|INPUT/.test(ta.tagName) || ta.selectionStart === ta.selectionEnd) { toast('먼저 글 칸에서 강조할 글자를 끌어서 고르세요', 'bad'); return; }
          const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value, cur = v.slice(a, b);
          ta.value = v.slice(0, a) + (/^_.*_$/.test(cur) ? cur.slice(1, -1) : '_' + cur + '_') + v.slice(b);
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        } }, '🖍 고른 글자 강조 (노랑)'),
        h('small', { class: 'hint' }, '_밑줄_ 로 감싼 글자는 게임에서 노란색으로 강조됩니다 (원작 영웅 설명과 같은 방식). 줄바꿈은 그대로 나옵니다.')),
    ];
  }
  function selectSection(key, c, ctx) {
    const { F, row } = PDM.ui;
    const s = c.select || {};
    const cv = h('canvas', { width: 320, height: 180, class: 'checker', style: { width: '320px', height: '180px', imageRendering: 'pixelated', border: '1px solid var(--line)', borderRadius: '4px' } });
    if (ctx._ill) ctx._ill();
    let timer = null, fi = 0;
    ctx._ill = () => { if (timer) clearInterval(timer); timer = null; };
    (async () => {
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      const img = s.illust ? await PDM.assets.load(s.illust) : null;
      const left = 107;   // 게임 화면처럼 왼쪽 1/3 은 이름·버튼 자리
      const draw = () => {
        g.fillStyle = '#1d1e20'; g.fillRect(0, 0, 320, 180);
        g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, left, 180);
        g.fillStyle = '#ffff44'; g.font = '9px sans-serif'; g.fillText(c.name || '', 10, 80);
        if (!img) { g.fillStyle = '#888'; g.fillText(s.illust ? '그림을 읽지 못했습니다' : '일러스트 없음 — 게임에서는 영웅 그림을 크게 보여 줍니다', left + 8, 90); return; }
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        const fw = +s.frameW || 0, fh = +s.frameH || 0;
        if (fw > 0 && fh > 0) {
          const cols = Math.max(1, Math.floor(img.width / fw)), n = cols * Math.max(1, Math.floor(img.height / fh));
          const list = String(s.frames || '').split(/[,\s]+/).filter(Boolean).map(Number).filter(x => !isNaN(x));
          const fr = list.length ? list : [...Array(n).keys()];
          const f = fr[fi % fr.length]; sx = (f % cols) * fw; sy = Math.floor(f / cols) * fh; sw = fw; sh = fh;
        }
        let k, x, y;
        if ((s.fit || 'right') === 'full') { k = 180 / sh; x = (320 - sw * k) / 2; y = 0; }
        else { k = Math.min(180 * .9 / sh, (320 - left) * .9 / sw); if (sw <= 160 && sh <= 160) k = Math.max(1, Math.floor(k)); x = left + (320 - left - sw * k) / 2; y = (180 - sh * k) / 2; }
        g.drawImage(img, sx, sy, sw, sh, x, y, sw * k, sh * k);
        if ((s.fit || 'right') === 'full') { const gr = g.createLinearGradient(0, 0, left + 20, 0); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.8, 'rgba(0,0,0,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, left + 20, 180); g.fillStyle = '#ffff44'; g.fillText(c.name || '', 10, 80); }
      };
      draw();
      if ((+s.frameW || 0) > 0 && (+s.frameH || 0) > 0) timer = setInterval(() => { fi++; draw(); }, 1000 / Math.max(1, +s.fps || 8));
    })();
    return [
      h('p', { class: 'hint' }, '게임의 영웅 선택 화면에서 이 영웅을 골랐을 때 오른쪽에 보이는 그림입니다. 비워 두면 ' + (String(c.baseClass || '').trim() && c.id.toUpperCase() === String(c.baseClass).toUpperCase() ? '게임 일러스트 (splashes/' + c.id.toLowerCase() + '.jpg)' : '영웅 그림(위 시트의 첫 프레임)을 크게') + ' 보여 줍니다. 그림 한 장이나, 프레임 크기를 정하면 시트로 움직이는 그림도 됩니다.'),
      h('div', { class: 'fl', style: { margin: '10px 0 2px' } }, '정보 창의 줄 (아이콘 + 글) — 원작 영웅 정보 창처럼'),
      h('p', { class: 'hint' }, '줄마다 왼쪽에 아이템 그림, 오른쪽에 글이 나옵니다. 예) 시작 무기 그림 + "낡은 소검과 투척용 돌을 가지고 시작합니다." 줄을 하나라도 넣으면 위의 "정보 창 설명" 대신 이 줄들이 나옵니다.'),
      PDM.ui.listEditor(key, ['select', 'infoRows'], { addLabel: '줄 추가', emptyText: '줄 없음 — 위의 "정보 창 설명"(비었으면 영웅 설명)이 글만 나옵니다',
        make: () => ({ icon: '', text: '' }),
        render: (it, i, p) => h('div', {},
          (() => { const inp = h('input', { type: 'text', value: it.icon || '', placeholder: '아이템 고르기 (비우면 아이콘 없음)' });
            inp.addEventListener('change', () => store.edit(key, '정보 줄 아이콘', o => { PDM.deepSet(o, [...p, 'icon'], inp.value.trim()); }));
            return PDM.ui.field('아이콘 (아이템 그림 — 프로젝트 아이템 · 게임 아이템)', PDM.ui.combo(inp, PDM.ui.itemOptions)); })(),
          F.textarea(key, [...p, 'text'], { label: '글', rows: 2 })) }),
      vanillaHero(c) || !String(c.baseClass || '').trim() ? null : h('p', { class: 'hint' }, '※ 게임 직업을 바탕으로 한 영웅은, 영웅 설명과 위 칸들을 손대지 않으면 바탕 직업의 정보 창(아이콘 줄 · 특성 탭)이 그대로 나옵니다.'),
      h('div', { class: 'fl', style: { margin: '10px 0 2px' } }, '일러스트'),
      F.image(key, ['select', 'illust'], { label: '일러스트 그림', sub: 'illustrations', rerender: true, placeholder: 'assets/illustrations/... (PNG)' }),
      row(F.select(key, ['select', 'fit'], [['right', '오른쪽에 맞춤 (전신 그림)'], ['full', '화면 높이 가득 (원작 일러스트처럼 — 가로로 긴 그림)']], { label: '배치', rerender: true }),
        F.num(key, ['select', 'frameW'], { label: '프레임 너비', int: true, min: 0, def: 0, hint: '0 = 그림 한 장', rerender: true }),
        F.num(key, ['select', 'frameH'], { label: '프레임 높이', int: true, min: 0, def: 0, rerender: true }),
        F.text(key, ['select', 'frames'], { label: '프레임 번호', placeholder: '예: 0,1,2,3 (비우면 전부)', rerender: true }),
        F.num(key, ['select', 'fps'], { label: '초당 프레임', int: true, min: 1, def: 8, rerender: true })),
      h('div', { class: 'fl', style: { margin: '6px 0 4px' } }, '미리보기 (게임 화면 비율)'), cv,
      F.image(key, ['select', 'icon'], { label: '선택 버튼 아이콘 (선택)', sub: 'icons', hint: '비우면 영웅 그림의 첫 프레임. 20px 안쪽으로 줄여 보여 줌' })];
  }

  function gaugeSection(key, c, st) {
    const { F, row, listEditor } = PDM.ui;
    const g = c.gauge || {};
    const out = [
      h('p', { class: 'hint' }, 'mod-2 아리아의 "과열"처럼 영웅에게 붙는 게이지(0~최대)와 원소(자세)입니다. 주문·직업 능력·코덱스의 "게이지 변화"로 오르고, 턴마다 규칙대로 오르내리며, 단계마다 능력치가 바뀌고, 최대가 되면 폭주합니다. 원소는 게임 화면 오른쪽의 행동 버튼으로 바꿉니다.'),
      row(F.bool(key, ['gauge', 'enabled'], { label: '게이지 사용', rerender: true }),
        h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); store.edit(key, '게이지: mod-2 과열 예시', o => { o.gauge = ARIA_GAUGE(); }); } }, 'mod-2 과열(4원소) 예시로 채우기'))];
    if (!g.enabled) return out;
    out.push(
      row(F.text(key, ['gauge', 'name'], { label: '이름', rerender: true }), F.num(key, ['gauge', 'max'], { label: '최대', int: true, min: 1 }),
        F.num(key, ['gauge', 'buffIcon'], { label: '버프 아이콘 번호 (BuffIndicator)', int: true, min: 0, hint: '2 = 불' })),
      h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '턴마다'),
      row(F.num(key, ['gauge', 'perTurn'], { label: '항상 +', int: true }), F.num(key, ['gauge', 'sameElement'], { label: '원소를 안 바꾼 턴 +', int: true }),
        F.num(key, ['gauge', 'afterUse'], { label: '주문·능력·코덱스를 쓴 뒤 +', int: true }), F.num(key, ['gauge', 'recentTurns'], { label: '"쓴 뒤" 턴 수', int: true, min: 0 }),
        F.num(key, ['gauge', 'idle'], { label: '그 밖의 턴 −', int: true, min: 0 })),
      h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '단계 (게이지가 "이상"이면 그 단계 — 가장 높은 것 하나)'),
      listEditor(key, ['gauge', 'levels'], { addLabel: '단계', compact: true, make: () => PDM.make.gaugeLevel(),
        render: (l, i, p) => h('div', {}, row(F.num(key, [...p, 'at'], { label: '이상', int: true, min: 0 }), F.text(key, [...p, 'name'], { label: '이름' }), F.text(key, [...p, 'desc'], { label: '설명' })), statsEditor(key, [...p, 'effects'])) }),
      h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '폭주 (최대가 되면)'),
      row(F.bool(key, ['gauge', 'overflow', 'enabled'], { label: '폭주 사용', def: true }), F.num(key, ['gauge', 'overflow', 'delay'], { label: '몇 턴 뒤', int: true, min: 0 }),
        F.num(key, ['gauge', 'overflow', 'resetTo'], { label: '폭주 뒤 게이지', int: true, min: 0 })),
      row(F.sysSound(key, ['gauge', 'sounds', 'overflow'], 'gauge.overflow', { label: '폭주할 때 소리' }), F.sysSound(key, ['gauge', 'sounds', 'switch'], 'gauge.switch', { label: '원소를 바꿀 때 소리' })),
      effectsEditor(key, ['gauge', 'overflow', 'effects'], { addLabel: '폭주 효과', emptyText: '효과 없음 (게이지만 되돌림)', make: () => ({ type: 'damage', on: 'area', radius: 3, min: 5, max: 10 }) }),
      h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '원소 (자세) — 첫 번째가 처음 원소'),
      row(F.num(key, ['gauge', 'switchCool'], { label: '바꾸면 게이지 −%', int: true, min: 0, max: 100 }), F.num(key, ['gauge', 'switchCooldown'], { label: '바꾼 뒤 대기(턴)', int: true, min: 0 }),
        F.list(key, ['gauge', 'replaceNative'], { label: '떼어 낼 게임 버프', hint: '바탕 직업이 이미 가진 게이지 (mod-2 아리아: NewOverHeat)' })),
      listEditor(key, ['gauge', 'elements'], { addLabel: '원소', make: () => PDM.make.element(),
        render: (el, i, p) => h('details', { open: !!st['el' + i], ontoggle: e => { st['el' + i] = e.target.open; } },
          h('summary', { style: { cursor: 'pointer' } }, h('span', { style: { display: 'inline-block', width: '10px', height: '10px', background: el.color || '#888', marginRight: '6px', borderRadius: '2px' } }), h('b', {}, el.name || el.id), h('span', { class: 'hint' }, '  ' + (el.desc || statsText(el.effects)))),
          row(F.text(key, [...p, 'name'], { label: '이름', rerender: true }), F.text(key, [...p, 'id'], { label: 'id (조건식: hero.element)', transform: v => PDM.slugId(v) }),
            F.text(key, [...p, 'color'], { label: '색 #rrggbb', rerender: true }), F.icon(key, [...p, 'icon'], 'hero', { label: '행동 버튼 아이콘', def: 0 })),
          F.text(key, [...p, 'desc'], { label: '설명' }),
          h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '이 원소일 때 능력치'), statsEditor(key, [...p, 'effects']),
          h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '이 원소로 바꿀 때 효과'), effectsEditor(key, [...p, 'onSwitch'], { emptyText: '없음', make: () => ({ type: 'shield', on: 'self', amount: 3 }) })) }));
    return out;
  }

  /** 특성 (Talent) — 단계 · 트리 · 선택한 특성의 세부 */
  function talentSection(key, c, st, ctx) {
    const { F, row, listEditor, field } = PDM.ui;
    const tiers = c.talentTiers && c.talentTiers.length ? c.talentTiers : PDM.TALENT_TIERS_DEFAULT;
    const talents = c.talents || [];
    const sel = Math.min(st.tal ?? 0, talents.length - 1);
    const name = id => { const t = talents.find(x => x.id === id); return t ? t.name : id; };
    const addTalent = tier => store.edit(key, '특성 추가', o => { o.talents = o.talents || []; if (!o.talentTiers) o.talentTiers = PDM.clone(PDM.TALENT_TIERS_DEFAULT); o.talents.push(PDM.make.talent(tier)); st.tal = o.talents.length - 1; });

    // 특성 하나의 최대 포인트 한도 — 원작은 4 (talentCapRaised 를 켜면 10 까지)
    const capBox = F.bool(key, ['talentCapRaised'], { label: '특성 최대 포인트 한도 늘리기 — 원작은 특성 하나에 4 포인트까지. 켜면 10 까지 정할 수 있음 (끄면 4 를 넘는 특성도 게임에서 4 까지만)', rerender: true });
    // 단계 설정
    const tierBox = h('details', { open: !!st.tierOpen, ontoggle: e => { st.tierOpen = e.target.open; } },
      h('summary', { style: { cursor: 'pointer' } }, h('b', {}, '단계 설정'), h('span', { class: 'hint' }, '  ' + tiers.map(t => `${t.name} Lv${t.unlockLevel}·${t.points}p`).join('  '))),
      h('p', { class: 'hint' }, '단계는 "열리는 레벨"부터 레벨마다 1 포인트씩, 최대 "포인트" 만큼 얻습니다 (원작: 2/7/13/21 레벨, 5/6/8/10 포인트, 3단계는 전직 뒤·4단계는 직업 능력 뒤). 포인트는 그 단계의 특성에만 씁니다. 전직·직업 능력이 없는 영웅이면 그 조건은 무시됩니다.'),
      listEditor(key, ['talentTiers'], { addLabel: '단계', compact: true, dup: false, make: () => ({ name: (tiers.length + 1) + '단계', unlockLevel: 25, points: 5 }),
        render: (t, i, p) => row(F.text(key, [...p, 'name'], { label: `${i + 1}. 이름`, rerender: true }), F.num(key, [...p, 'unlockLevel'], { label: '열리는 레벨', int: true, min: 1, rerender: true }), F.num(key, [...p, 'points'], { label: '포인트', int: true, min: 0, rerender: true }),
          F.select(key, [...p, 'requires'], PDM.TIER_REQUIRES, { label: '열리는 조건', rerender: true })) }),
      h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); store.edit(key, '특성 단계 기본값', o => { o.talentTiers = PDM.clone(PDM.TALENT_TIERS_DEFAULT); }); } }, '원작(SPD) 기본값으로'));

    // 트리
    const cols = tiers.map((t, ti) => h('div', { class: 'tal-col' },
      h('div', { class: 'tal-head' }, h('b', {}, t.name), h('span', { class: 'hint' }, ` Lv${t.unlockLevel}${t.requires === 'subclass' ? '·전직' : t.requires === 'ability' ? '·능력' : ''} · ${talents.filter(x => (x.tier || 1) === ti + 1).reduce((a, x) => a + (x.maxPoints || 0), 0)}/${t.points}p`)),
      ...talents.map((x, i) => [x, i]).filter(([x]) => (x.tier || 1) === ti + 1).map(([x, i]) => h('div', {
        class: 'tal-card' + (i === sel ? ' on' : ''), onclick: () => { st.tal = i; ctx.refresh(); } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '5px' } }, PDM.drawIcon(h('canvas', { style: { imageRendering: 'pixelated' } }), 'talent', x.icon || 0, 1), h('b', {}, x.name || x.id), h('span', { class: 'tal-pts' }, ' ' + '◆'.repeat(Math.min(5, x.maxPoints || 0)) + ((x.maxPoints || 0) > 5 ? '+' : ''))),
        x.requires ? h('div', { class: 'hint' }, '← ' + name(x.requires)) : null,
        x.subclass || x.ability ? h('div', { class: 'hint' }, '전용: ' + [x.subclass && ((c.subclasses || []).find(y => y.id === x.subclass) || {}).name, x.ability && ((c.abilities || []).find(y => y.id === x.ability) || {}).name].filter(Boolean).join(', ')) : null,
        h('div', { class: 'hint' }, (x.effects || []).map(e => e.type === 'stat' ? (PDM.TALENT_STATS[e.stat] || e.stat).replace(/ \(.*\)/, '') + (e.perPoint > 0 ? '' : '') + ' ' + e.perPoint + '/p'
          : e.type === 'spell' ? `${e.spell === '*' ? '모든 주문·능력' : e.spell} ${(PDM.SKILL_FIELDS[e.field] || e.field).replace(/ \(.*\)/, '')} ${e.perPoint > 0 ? '+' : ''}${e.perPoint}/p`
          : `주문 ${e.spell} 배움`).join(' · ')))),
      h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); addTalent(ti + 1); } }, '+ 특성')));
    const tree = h('div', { class: 'tal-tree' }, cols);

    // 계산기
    const lv = st.calcLv || 10;
    const pts = PDM.talentPoints(tiers, lv);
    const lvIn = h('input', { type: 'number', min: 1, max: 30, value: lv, style: { width: '60px' } });
    lvIn.addEventListener('change', () => { st.calcLv = +lvIn.value || 1; ctx.refresh(); });
    const calc = h('div', { class: 'hint', style: { margin: '6px 0' } }, '레벨 ', lvIn, ' 에서 얻은 포인트: ', tiers.map((t, i) => `${t.name} ${pts[i]}`).join(' · '), ` (합 ${pts.reduce((a, b) => a + b, 0)})`);

    // 세부
    let detail = h('div', { class: 'empty' }, talents.length ? '' : '특성이 없습니다. 위의 "+ 특성"으로 추가하세요.');
    if (sel >= 0 && talents[sel]) {
      const t = talents[sel], p = ['talents', sel];
      const others = talents.filter(x => x.id !== t.id).map(x => [x.id, `${x.name} (${x.tier}단계)`]);
      const skills = (c.spells || []).map(x => [x.id, x.name + ' (주문)']);
      const modTargets = [...skills, ...(c.abilities || []).map(x => [x.id, x.name + ' (직업 능력)']), ...store.all('item').filter(x => x.kind === 'codex').map(x => [x.id, x.name + ' (코덱스)'])];
      const cap = c.talentCapRaised ? 10 : 4, mp = Math.max(1, Math.min(cap, t.maxPoints || 1));
      detail = h('div', { class: 'tal-detail' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('b', {}, '선택한 특성: ', t.name),
          h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); store.edit(key, '특성 복제', o => { const x = PDM.clone(o.talents[sel]); x.id += '_2'; o.talents.splice(sel + 1, 0, x); st.tal = sel + 1; }); } }, '복제'),
          h('button', { class: 'btn xs danger', onclick: e => { e.preventDefault(); store.edit(key, '특성 삭제', o => { o.talents.splice(sel, 1); st.tal = Math.max(0, sel - 1); }); } }, '삭제')),
        row(F.text(key, [...p, 'name'], { label: '이름', rerender: true }), F.text(key, [...p, 'id'], { label: 'id (코드: HeroRuntime.talent("id"))', transform: v => PDM.slugId(v), rerender: true }),
          F.select(key, [...p, 'tier'], Object.fromEntries(tiers.map((x, i) => [i + 1, x.name])), { label: '단계', number: true, rerender: true }),
          F.num(key, [...p, 'maxPoints'], { label: `최대 포인트 (1~${cap})`, int: true, min: 1, max: cap, rerender: true, hint: (t.maxPoints || 0) > cap ? `⚠ ${t.maxPoints} 로 적혀 있지만 게임에서는 ${cap} 까지만 씀` : '원작: 1~2단계 2p, 3단계 3p, 4단계 4p — 원작 한도는 4' }),
          F.icon(key, [...p, 'icon'], 'talent', { label: '아이콘 (게임 특성 아이콘 · 파일 지정 · 그리기)', def: 0 })),
        F.textarea(key, [...p, 'desc'], { label: '설명', rows: 2 }),
        h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '포인트마다 붙는 설명 (게임 창에 "+1 …", "+2 …" 로 나옴)'),
        ...Array.from({ length: mp }, (_, i) => F.text(key, [...p, 'pointText', i], { label: `+${i + 1}` })),
        row(F.select(key, [...p, 'requires'], others, { label: '먼저 필요한 특성', empty: '(없음)', rerender: true }),
          t.requires ? F.num(key, [...p, 'requiresPoints'], { label: '그 특성 포인트 이상', int: true, min: 1 }) : null,
          F.select(key, [...p, 'subclass'], (c.subclasses || []).map(x => [x.id, x.name]), { label: '이 전직일 때만', empty: '(모두)', rerender: true, hint: '원작 3단계 전직 특성' }),
          F.select(key, [...p, 'ability'], (c.abilities || []).map(x => [x.id, x.name]), { label: '이 직업 능력일 때만', empty: '(모두)', rerender: true, hint: '원작 4단계 능력 특성' })),
        h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '효과 (포인트 × 값)'),
        listEditor(key, [...p, 'effects'], { addLabel: '효과', compact: true, make: () => ({ type: 'stat', stat: 'hp', perPoint: 3 }),
          render: (e, j, ep) => {
            const ty = F.select(key, [...ep, 'type'], PDM.TALENT_EFFECTS, { label: '종류', rerender: true });
            if (e.type === 'unlockSpell') return row(ty, F.select(key, [...ep, 'spell'], skills, { label: '배우는 주문', empty: '(선택)' }),
              h('span', { class: 'hint' }, '1 포인트 이상이면 이 주문을 배우고, 그 전에는 주문 창에 나오지 않습니다 (원작 성직자: 특성 = 주문).'));
            if (e.type === 'spell') return row(ty, F.select(key, [...ep, 'spell'], [['*', '모든 주문·능력'], ...modTargets], { label: '대상', empty: '(선택)' }),
              F.select(key, [...ep, 'field'], PDM.SKILL_FIELDS, { label: '바꿀 값' }), F.num(key, [...ep, 'perPoint'], { label: '포인트당 (음수 = 줄임)', step: 1 }));
            return row(ty, F.select(key, [...ep, 'stat'], PDM.TALENT_STATS, { label: '능력치' }), F.num(key, [...ep, 'perPoint'], { label: '포인트당', step: 1 }));
          } }),
        entryCode(key, p, t, 'talent', st, sel));
    }
    return [
      h('p', { class: 'hint' }, '원작처럼 레벨이 오르면 포인트를 얻고(초상화가 반짝임), 게임의 영웅 정보 창(왼쪽 위 초상화) → 특성 탭에서 별 포인트를 써서 올립니다. 전직·직업 능력·주문도 같은 탭 위쪽에 나옵니다. 더 복잡한 효과는 코드 훅 "특성 올림"이나 HeroRuntime.talent("id") 로 만드세요.'),
      PDM.gameHeroBox(c, 'talents', !!c.nativeTalents, st),
      F.bool(key, ['nativeTalents'], { label: '게임 원래 특성 창을 그대로 쓰기 (바탕 직업의 특성 — 아래 특성·주문은 창에 안 나옴)' }),
      capBox, tierBox, tree, calc, detail];
  }

  PDM.registerEditor({
    id: 'hero', icon: () => '★',
    match: k => k.startsWith('hero:'),
    title: k => { const c = store.get(k); return c ? c.name : k; },
    watch: (ck, tk) => ck === tk || ck === 'project',
    tree() {
      if (!store.isOpen) return [];
      const all = orderedHeroes();
      const start = (store.get('project') || {}).startHero;
      return [{ id: 'hero', label: '영웅 (플레이어블)', icon: '★', order: 15, count: all.length,
        menu: [{ label: '새 영웅…', run: newHero }],
        children: all.map((c, i) => ({ id: 'h_' + c.id, label: c.name + (c.id === start ? ' ◀ 시작 영웅' : '') + (c.enabled === false ? ' (꺼짐)' : ''), icon: (i + 1) + '.', open: 'hero:' + c.id,
          // 게임 영웅 선택 화면의 순서 — ▲▼ 를 누르면 한 칸씩 옮김
          actions: [i > 0 ? { label: '▲', title: '위로 (게임 영웅 선택 화면에서 앞으로)', run: () => moveHero(c.id, -1) } : null, i < all.length - 1 ? { label: '▼', title: '아래로', run: () => moveHero(c.id, 1) } : null].filter(Boolean),
          menu: [{ label: '열기', run: () => PDM.tabs.open('hero:' + c.id) }, { label: '위로 (순서)', run: () => moveHero(c.id, -1), disabled: i === 0 }, { label: '아래로 (순서)', run: () => moveHero(c.id, 1), disabled: i === all.length - 1 }, { label: '시작 영웅으로', run: () => store.edit('project', '시작 영웅', p => { p.startHero = c.id; }) }, { label: 'id 바꾸기…', run: () => renameHero(c.id) }, { label: '복제', run: () => dupHero(c.id) }, '-',
            { label: '삭제', run: async () => { if (await PDM.ui.confirm(`「${c.name}」 영웅을 삭제할까요?`)) store.remove('hero:' + c.id, '영웅 삭제'); } }] })) }];
    },
    render(key, ctx) {
      const c = store.get(key);
      const { F, section, row, listEditor, field } = PDM.ui;
      const st = ctx.state = ctx.state || { anim: 'idle' };
      ctx.onDispose(() => { ctx._stop && ctx._stop(); ctx._ill && ctx._ill(); });
      const proj = store.get('project') || {};
      const isStart = proj.startHero === c.id;

      // 바탕 직업: 없음(완전히 새 영웅) · 목록 · 직접 입력
      const zero = !String(c.baseClass || '').trim();
      const clsIn = h('input', { type: 'text', value: c.baseClass || '', placeholder: '없음 — 완전히 새 영웅' });
      clsIn.addEventListener('change', () => PDM.ui.commit(key, ['baseClass'], clsIn.value.trim().toUpperCase(), '바탕 직업'));
      const clsDl = null;

      const linked = c.character && store.get('char:' + c.character);

      return h('div', { class: 'page' },
        h('h1', {}, '★ ', c.name, h('span', { class: 'hint', style: { marginLeft: '8px' } }, c.id), isStart ? h('span', { class: 'badge good', style: { marginLeft: '8px' } }, '시작 영웅') : null),
        h('div', { style: { display: 'flex', gap: '6px', margin: '-4px 0 8px', flexWrap: 'wrap' } },
          h('button', { class: 'btn sm', title: '영웅 id (파일 이름 · 코드 클래스 이름)를 바꿉니다', onclick: () => renameHero(c.id) }, 'id 바꾸기…'),
          h('button', { class: 'btn sm', title: '이 영웅의 데이터 파일(heroes/' + c.id + '.json)을 그대로 봅니다', onclick: () => PDM.ui.codeView(`heroes/${c.id}.json`, JSON.stringify(store.get(key), null, 2)) }, '{ } 데이터 파일 보기'),
          h('button', { class: 'btn sm', title: '테스트 플레이 때 만들어지는 이 영웅의 Java 코드 파일 (pdmaker/gen/' + PDM.codegen.heroClass(c.id) + '.java) — 외부 편집기로도 열 수 있음', onclick: () => { const cg = PDM.codegen; PDM.showCodeFile('pdmaker/gen/' + cg.heroClass(c.id) + '.java', cg.heroClass(c.id) + '.java' + (cg.heroNeedsClass(store.get(key)) ? '' : ' (코드 칸이 비어 있어 실제로는 만들지 않음)'), cg.heroSource(store.get(key))); } }, '☕ 코드 파일 보기'),
          c.baseClass ? h('button', { class: 'btn sm', title: '바탕 직업이 정의된 게임 코드 (actors/hero/HeroClass.java — 시작 아이템 · 전직 · 직업 능력 등)', onclick: () => PDM.showCodeFile('actors/hero/HeroClass.java', '게임 코드 — HeroClass (' + c.baseClass + ')') }, '게임 코드 보기 (HeroClass)') : null),
        h('p', { class: 'lead' }, '게임의 영웅 선택 화면에 이 영웅이 나옵니다 (시작 영웅을 정하면 그 영웅 하나만). ' + (zero
          ? '바탕 직업이 없는 완전히 새 영웅입니다 — 시작 아이템·감정된 아이템·특성·전직·직업 능력 모두 이 편집기에서 정한 것만 씁니다.'
          : '바탕 직업 「' + (PDM.HERO_CLASSES[String(c.baseClass).toUpperCase()] || c.baseClass) + '」의 게임 기능(시작 아이템·특성·전직·직업 능력 등)을 물려받고, 여기서 정한 것을 더하거나 바꿉니다.')),
        section('기본',
          row((() => {   // 이름 하나로: 게임(선택 화면 · 시작 버튼 · 저장 슬롯)에 나오는 이름 = 리소스 목록의 이름
            const cur = String((c.select || {}).title || '').trim() || (vanillaHero(c) ? '' : c.name || '');
            const i = h('input', { type: 'text', value: cur, placeholder: vanillaHero(c) ? `(게임 이름 그대로 — ${c.name || c.id})` : c.id });
            i.addEventListener('change', () => { const v = i.value.trim(); store.edit(key, '영웅 이름', r => { r.select = r.select || {}; r.select.title = v; r.name = v || (vanillaHero(r) ? (PDM.HERO_CLASSES[String(r.baseClass).toUpperCase()] || r.name) : r.id); }); });
            return field('이름 (게임의 선택 화면 · 시작 버튼 · 저장 슬롯 · 리소스 목록)', i, vanillaHero(c) ? '비우면 게임의 원래 직업 이름' : '');
          })(), F.bool(key, ['enabled'], { label: '사용 (선택 화면에 나옴)' })),
          ...selectTextFields(key, c),
          row(field('바탕 직업 (선택)', PDM.ui.combo(clsIn, () => [['', '없음 — 완전히 새 영웅'], ...Object.entries(PDM.heroClasses()).map(([k, v]) => [k, v + ' 물려받기'])], { minWidth: 220 }),
            '비워 두면 처음부터 새로 만드는 영웅입니다 (게임 직업에서 아무것도 물려받지 않음 — 그림이 비었을 때만 전사 그림). 원작 직업을 고치고 싶을 때만 고르세요. 모드 직업은 이름을 직접 입력'),
            F.ref(key, ['character'], 'char', { label: '연결된 캐릭터 (대사 화자·초상화)', empty: '(없음)' })),
          h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
            isStart ? h('button', { class: 'btn sm', onclick: () => store.edit('project', '시작 영웅 해제', p => { p.startHero = ''; }) }, '시작 영웅 해제')
              : h('button', { class: 'btn sm pri', onclick: () => store.edit('project', '시작 영웅', p => { p.startHero = c.id; }) }, '이 영웅을 시작 영웅으로'),
            linked ? h('button', { class: 'btn sm', onclick: () => store.edit(key, '캐릭터 그림 가져오기', o => { o.sprite = PDM.clone(linked.sprite); }) }, `「${linked.name}」 그림 가져오기`) : null)),
        section('그림 (영웅 시트)',
          h('p', { class: 'hint' }, '행 = 갑옷 단계(0~6), 열 = 프레임. 비워 두면 ' + (zero ? '게임 기본(전사) 그림' : '바탕 직업의 그림') + '을 씁니다. 프레임 번호는 첫 행 기준이고, 갑옷을 바꾸면 같은 열의 아래 행을 씁니다.'),
          ...PDM.spriteEditor(key, c, ctx, st)),
        section('캐릭터 선택 화면 (글자 · 일러스트)', ...selectSection(key, c, ctx)),
        section('해금 조건 (선택 화면에서 잠김)', ...(() => {
          const u = c.unlock || {}, mode = u.mode || (vanillaHero(c) ? 'game' : 'always');
          const sel = h('select', {}, [['always', '항상 열림'], ['game', '게임 코드의 해금 조건 (HeroClass.isUnlocked — 바탕 직업의 배지)'], ['badge', '게임 배지를 얻었을 때 (보스 처치 · 승리)'], ['global', '전역 스위치가 켜졌을 때 (이벤트로 켬)'], ['cond', '조건식']]
            .filter(([k]) => k !== 'game' || String(c.baseClass || '').trim()).map(([k, t]) => h('option', { value: k, selected: mode === k }, t)));
          sel.onchange = () => store.edit(key, '해금 조건', o => { o.unlock = Object.assign({ badge: 'BOSS_SLAIN_1', key: '', cond: '', text: '' }, o.unlock || {}, { mode: sel.value }); });
          return [
            PDM.ui.field('언제 열리나', sel),
            mode === 'badge' ? F.select(key, ['unlock', 'badge'], { BOSS_SLAIN_1: '첫 번째 보스 처치', BOSS_SLAIN_2: '두 번째 보스 처치', BOSS_SLAIN_3: '세 번째 보스 처치', BOSS_SLAIN_4: '네 번째 보스 처치', VICTORY: '게임 클리어 (승리)' }, { label: '배지 (한 번이라도 얻은 적이 있으면 열림)' }) : null,
            mode === 'global' ? F.text(key, ['unlock', 'key'], { label: '전역 스위치 이름 (영문)', placeholder: '예: hero2_unlocked', hint: '이벤트 명령 "전역 스위치 (새 게임에도 유지)"로 켭니다. 한 번 켜지면 새 게임을 시작해도 남습니다.' }) : null,
            mode === 'cond' ? F.cond(key, ['unlock', 'cond'], { label: '조건식', placeholder: '예: global.beat_boss && global.found_secret', hint: '선택 화면은 게임을 시작하기 전이므로 global.<이름> (전역 스위치)만 뜻이 있습니다.' }) : null,
            mode !== 'always' ? PDM.gameHeroText(F.textarea(key, ['unlock', 'text'], { label: '잠겨 있을 때 누르면 나오는 글 (비우면 기본)', rows: 2, placeholder: mode === 'game' ? '(게임 글자 actors.hero.heroclass.' + String(c.baseClass || '').toLowerCase() + '_unlock)' : '예: 첫 번째 보스를 쓰러뜨리면 열립니다.' }), mode === 'game' ? c.baseClass : '', 'unlock') : null,
            h('p', { class: 'hint' }, mode === 'game' ? '※ 테스트 플레이(디버그 실행)에서는 게임 규칙상 모든 직업이 열려 있습니다. 내보낸 게임에서 잠깁니다.' : mode === 'always' ? '선택 화면에서 바로 고를 수 있습니다.' : '잠긴 영웅은 선택 화면에서 어둡게 보이고, 누르면 위의 글이 나옵니다.')];
        })()),
        section('능력치',
          row(F.num(key, ['stats', 'hp'], { label: '시작 최대 체력', int: true, min: 1, hint: '게임 기본 20' }),
            F.num(key, ['stats', 'hpPerLevel'], { label: '레벨당 체력', int: true, min: 0, hint: '게임 기본 5' }),
            F.num(key, ['stats', 'str'], { label: '힘', int: true, min: 1, hint: '게임 기본 10' }),
            F.num(key, ['startGold'], { label: '💰 시작 소지금 (금화)', int: true, min: 0, def: 0, hint: '새 게임을 시작할 때 가지고 있는 금화' })),
          h('div', { class: 'fl', style: { margin: '8px 0 2px' } }, '세부 능력치 (아래 안내의 게임 기본값과 같으면 게임 코드 그대로 동작)'),
          row(F.num(key, ['stats', 'attackSkill'], { label: '명중', int: true, min: 0, def: 10, hint: '기본 10' }),
            F.num(key, ['stats', 'accPerLvl'], { label: '레벨당 명중', int: true, min: 0, def: 1, hint: '기본 1' }),
            F.num(key, ['stats', 'defenseSkill'], { label: '회피', int: true, min: 0, def: 5, hint: '기본 5' }),
            F.num(key, ['stats', 'evaPerLvl'], { label: '레벨당 회피', int: true, min: 0, def: 1, hint: '기본 1' })),
          row(F.num(key, ['stats', 'unarmedMin'], { label: '맨손 최소 피해', int: true, min: 0, def: 0, hint: '0 = 게임 기본 (1)' }),
            F.num(key, ['stats', 'unarmedMax'], { label: '맨손 최대 피해', int: true, min: 0, def: 0, hint: '0 = 게임 기본 (4)' }),
            F.num(key, ['stats', 'speed'], { label: '이동 속도 배율', min: 0.1, step: 0.1, def: 1, hint: '1 = 보통, 2 = 두 배 빠름' }),
            F.num(key, ['stats', 'viewDistance'], { label: '시야', int: true, min: 1, max: 12, def: 8, hint: '기본 8' })),
          knownItemsField(key)),
        section('시작 인벤토리', ...(() => {
          const inv = c.inventory || {}, clear = !!inv.clearDefault;
          const items = inv.items || [];
          const hasGame = items.some(x => x.fromGame);
          const van = (PDM.SPD_HEROES || []).find(x => x.cls === String(c.baseClass || '').toUpperCase());
          const restore = () => store.edit(key, '시작 아이템: 게임 기본으로', o => {
            o.inventory = o.inventory || {}; o.inventory.clearDefault = false;
            const own = (o.inventory.items || []).filter(x => !x.fromGame);
            o.inventory.items = [...(van ? van.items : []).map(e => Object.assign({ item: '', count: 1, level: 0, equip: false, quickslot: false, identify: true, fromGame: true }, e)), ...own];
          });
          return [
            PDM.gameHeroBox(c, 'inv', !clear, st),
            zero ? h('div', { class: 'hint', style: { marginBottom: '6px' } }, '완전히 새 영웅이라 이 목록대로만 줍니다 (게임 직업의 시작 아이템 없음).') : h('div', { class: 'hint', style: { marginBottom: '6px' } }, clear
              ? '이 목록대로만 줍니다 (바탕 직업의 기본 시작 아이템은 주지 않음).'
              : hasGame ? '「게임이 줌」 표시는 바탕 직업이 원래 주는 원작 시작 아이템입니다 (보여 주기만 — 게임이 그대로 줌). 표시 없는 아이템은 거기에 더해 줍니다. 원작 아이템을 바꾸려면 "목록대로 직접 주기"를 누르세요.'
                : '여기 넣은 아이템을 바탕 직업의 기본 시작 아이템에 더해 줍니다.'),
            zero ? null : h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' } },
              !clear ? h('button', { class: 'btn sm', title: '게임 기본 시작 아이템을 비우고 아래 목록(게임이 줌 포함)대로 줍니다', onclick: () => store.edit(key, '시작 아이템: 목록대로', o => { o.inventory.clearDefault = true; }) }, '목록대로 직접 주기 (게임 기본 대신)') : null,
              van ? h('button', { class: 'btn sm', onclick: restore }, `게임 기본(${van.name})으로 되돌리기`) : null,
              clear ? h('button', { class: 'btn sm', onclick: () => store.edit(key, '시작 아이템: 게임 기본 더하기', o => { o.inventory.clearDefault = false; }) }, '게임 기본도 주기') : null),
            listEditor(key, ['inventory', 'items'], {
              addLabel: '시작 아이템', emptyText: '추가로 주는 아이템이 없습니다',
              make: () => ({ item: '', count: 1, level: 0, equip: false, quickslot: false, identify: true }),
              render: (it, i, p) => h('div', { style: it.fromGame && !clear ? { opacity: .8 } : {} },
                it.fromGame ? h('span', { class: 'badge', style: { marginBottom: '4px', display: 'inline-block' } }, clear ? '원작 시작 아이템 (목록대로 줌)' : '게임이 줌') : null,
                row(itemInput(key, [...p, 'item']), F.num(key, [...p, 'count'], { label: '개수', int: true, min: 1 }), F.num(key, [...p, 'level'], { label: '강화', int: true, min: 0 })),
                row(F.bool(key, [...p, 'equip'], { label: '장착' }), F.bool(key, [...p, 'quickslot'], { label: '퀵슬롯' }), F.bool(key, [...p, 'identify'], { label: '감정됨' }),
                  /BrokenSeal$/.test(it.item || '') ? F.bool(key, [...p, 'affix'], { label: '입은 갑옷에 붙이기' }) : null,
                  /MagesStaff$/.test(it.item || '') ? F.text(key, [...p, 'imbue'], { label: '넣은 마법봉 (예: wands.WandOfMagicMissile)' }) : null))
            })];
        })()),
        section('주문 (주문서 — 원작 성직자 방식)', ...spellSection(key, c, st, ctx)),
        section('전직 (Subclass)', ...subclassSection(key, c, st)),
        section('직업 능력 (Armor Ability)', ...abilitySection(key, c, st)),
        // 게이지·원소 데이터 편집은 뺐음 (특수 기능은 코드로 — 아래 "코드" 의 특수 기능 만들기). 예전 프로젝트에서 켜 둔 경우만 보여 줌
        c.gauge && c.gauge.enabled ? section('게이지 · 원소 (예전 기능)',
          h('p', { class: 'hint' }, '예전에 켜 둔 게이지 데이터입니다. 지금은 이런 특수 기능을 "코드" 칸의 특수 기능 만들기(Special)로 만듭니다. 그대로 두면 계속 동작합니다.'),
          h('button', { class: 'btn sm', onclick: e => { e.preventDefault(); store.edit(key, '게이지 끄기', o => { o.gauge.enabled = false; }); } }, '게이지 끄기'),
          ...gaugeSection(key, c, st)) : null,
        section('특성 (Talent)', ...talentSection(key, c, st, ctx)),
        section('패시브',
          h('p', { class: 'hint' }, '레벨(과 조건)에 따라 열리는 지속 효과. 효과 칸으로 부족하면 각 패시브의 "코드" 로 세부 동작을 직접 쓰세요 (열린 뒤에만 동작).'),
          listEditor(key, ['passives'], {
            addLabel: '패시브', emptyText: '패시브가 없습니다',
            make: () => PDM.make.passive(),
            render: (ps, i, p) => h('div', {},
              row(F.text(key, [...p, 'name'], { label: '이름' }), F.num(key, [...p, 'unlockLevel'], { label: '열리는 레벨', int: true, min: 1 }), F.cond(key, [...p, 'cond'], { label: '조건' })),
              F.text(key, [...p, 'desc'], { label: '설명' }),
              listEditor(key, [...p, 'effects'], { addLabel: '효과', compact: true, make: () => ({ stat: 'hp', value: 5 }),
                render: (e, j, ep) => row(F.select(key, [...ep, 'stat'], PDM.PASSIVE_STATS, { label: '효과' }), F.num(key, [...ep, 'value'], { label: '값', int: true })) }),
              entryCode(key, p, ps, 'passive', st, i))
          })),
        section('코드 (Java) — 세부 동작', ...heroCodeSection(key, c, st, ctx)),
        section('메모', F.textarea(key, ['note'], { rows: 2 })));
    }
  });
  PDM.heroes = { newHero };
})();
