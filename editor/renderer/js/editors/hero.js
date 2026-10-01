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
    ['진행', ['onGameStart', 'onFloorEnter', 'onTurn', 'onLevelUp', 'onKill', 'onTalentUp']],
    ['전투 수치', ['attackSkill', 'defenseSkill', 'damageRoll', 'drRoll', 'speed']],
    ['전투 반응', ['attackProc', 'defenseProc']],
    ['기타', ['members', 'imports']]
  ];
  const HOOK_LABEL = { onGameStart: '게임 시작', onFloorEnter: '층 입장', onTurn: '매 턴', onLevelUp: '레벨업', onKill: '처치', onTalentUp: '특성 올림',
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
      ['HeartSystem.applyAction("char", "TALK")', '마음 행동 적용']
    ].map(([a, b]) => h('tr', {}, h('td', {}, h('code', {}, a)), h('td', {}, b)))),
    h('p', { class: 'hint' }, '원본 게임의 클래스(actors, items, buffs…)는 이미 import 되어 있습니다. 모드에만 있는 클래스는 import 칸에 적으세요.'));

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
        F.num(key, [...p, 'heat'], { label: '게이지 변화', int: true, rerender: true, hint: '게이지·원소를 켰을 때 (과열 +)' })),
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
      h('p', { class: 'hint' }, '원작 성직자처럼 영웅이 처음부터 "주문서"를 가지고, 주문서의 충전을 써서 주문을 겁니다. 주문은 1~4단계로 나뉘고 조건(레벨·특성·전직·직업 능력)을 채운 것만 주문 창에 나옵니다. 게임: 주문서 → 주문 창(아이콘을 누르면 시전, 길게 누르면 퀵슬롯 빠른 시전), 영웅 정보 창의 특성 탭 위쪽에도 나옵니다.'),
      row(F.bool(key, ['spellbook', 'enabled'], { label: '주문서 주기', def: true, rerender: true }), F.text(key, ['spellbook', 'name'], { label: '주문서 이름' }),
        F.num(key, ['spellbook', 'image'], { label: '그림 번호 (items.png)', int: true, min: 0, hint: '246 = 마법서' }),
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
      h('p', { class: 'hint' }, '원작처럼 텐구를 쓰러뜨리면 나오는 "텐구의 가면"을 쓰면 이 목록에서 하나를 고릅니다 (이벤트 명령 "전직 고르기"로도 열 수 있음). 전직하면 특성 3단계가 열리고, "이 전직만" 표시한 주문·특성이 나옵니다. 비워 두면 게임 원래 전직(바탕 직업 것)을 씁니다.'),
      listEditor(key, ['subclasses'], {
        addLabel: '전직', emptyText: '전직이 없습니다 (게임 원래 전직을 씀)',
        make: () => PDM.make.subclass(),
        render: (x, i, p) => h('details', { open: !!st['sc' + i], ontoggle: e => { st['sc' + i] = e.target.open; } },
          h('summary', { style: { cursor: 'pointer' } }, iconCanvas(x.icon || 0), h('b', {}, x.name || x.id), h('span', { class: 'hint' }, '  ' + (x.shortDesc || '') + (x.base ? ` · 게임 전직 ${x.base}` : '') + ((x.effects || []).length ? ' · ' + statsText(x.effects) : ''))),
          row(F.text(key, [...p, 'name'], { label: '이름', rerender: true }), F.text(key, [...p, 'id'], { label: 'id (조건식: hero.subclass)', transform: v => PDM.slugId(v), rerender: true }),
            F.icon(key, [...p, 'icon'], 'hero', { label: '아이콘 (게임 아이콘 · 파일 지정 · 그리기)', def: 0 }),
            F.select(key, [...p, 'base'], PDM.GAME_SUBCLASSES, { label: '게임 전직 효과도 켜기', empty: '(없음)', rerender: true, hint: '예: BERSERKER 면 원작 광전사의 분노가 함께 동작. 바탕 직업에 맞는 것을 고르세요' })),
          F.text(key, [...p, 'shortDesc'], { label: '한 줄 설명 (고르는 창의 버튼)' }),
          F.textarea(key, [...p, 'desc'], { label: '설명', rows: 2 }),
          h('div', { class: 'fl', style: { margin: '6px 0 2px' } }, '전직하면 붙는 능력치'),
          statsEditor(key, [...p, 'effects']),
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
      h('p', { class: 'hint' }, '원작처럼 "왕의 왕관"을 쓰면 이 목록에서 하나를 골라 입은 갑옷이 직업 갑옷이 되고, 갑옷의 충전(0~100%)을 써서 발동합니다 (이벤트 명령 "직업 능력 고르기"로도 열 수 있음). 고르면 특성 4단계가 열립니다. 원작은 셋 중 하나. 비워 두면 게임 원래 능력을 씁니다.'),
      listEditor(key, ['abilities'], {
        addLabel: '직업 능력', emptyText: '직업 능력이 없습니다 (게임 원래 능력을 씀)',
        make: () => PDM.make.ability(),
        render: (x, i, p) => h('details', { open: !!st['ab' + i], ontoggle: e => { st['ab' + i] = e.target.open; } },
          h('summary', { style: { cursor: 'pointer' } }, iconCanvas(x.icon ?? castIconDef(x)), h('b', {}, x.name || x.id), h('span', { class: 'hint' }, '  ' + castSummary(x, 'ability'))),
          row(F.text(key, [...p, 'name'], { label: '이름', rerender: true }), F.text(key, [...p, 'id'], { label: 'id (조건식: hero.ability)', transform: v => PDM.slugId(v), rerender: true }),
            F.icon(key, [...p, 'icon'], 'hero', { label: '아이콘 (게임 아이콘 · 파일 지정 · 그리기)', def: castIconDef(x) })),
          F.text(key, [...p, 'shortDesc'], { label: '한 줄 설명 (왕관 창의 버튼)' }),
          F.textarea(key, [...p, 'desc'], { label: '설명', rows: 2 }),
          h('div', {}, h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); PDM.ui.commit(key, [...p, 'desc'], castAutoDesc(x), '능력 설명 자동'); } }, '효과로 설명 만들기')),
          talentMods(c, x.id),
          ...castFields(key, p, x, 'ability'))
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
      const mp = Math.max(1, t.maxPoints || 1);
      detail = h('div', { class: 'tal-detail' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, h('b', {}, '선택한 특성: ', t.name),
          h('button', { class: 'btn xs', onclick: e => { e.preventDefault(); store.edit(key, '특성 복제', o => { const x = PDM.clone(o.talents[sel]); x.id += '_2'; o.talents.splice(sel + 1, 0, x); st.tal = sel + 1; }); } }, '복제'),
          h('button', { class: 'btn xs danger', onclick: e => { e.preventDefault(); store.edit(key, '특성 삭제', o => { o.talents.splice(sel, 1); st.tal = Math.max(0, sel - 1); }); } }, '삭제')),
        row(F.text(key, [...p, 'name'], { label: '이름', rerender: true }), F.text(key, [...p, 'id'], { label: 'id (코드: HeroRuntime.talent("id"))', transform: v => PDM.slugId(v), rerender: true }),
          F.select(key, [...p, 'tier'], Object.fromEntries(tiers.map((x, i) => [i + 1, x.name])), { label: '단계', number: true, rerender: true }),
          F.num(key, [...p, 'maxPoints'], { label: '최대 포인트', int: true, min: 1, max: 6, rerender: true, hint: '원작: 1~2단계 2p, 3단계 3p' }),
          F.icon(key, [...p, 'icon'], 'talent', { label: '아이콘 (talent_icons.png)', def: 0 })),
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
          } }));
    }
    return [
      h('p', { class: 'hint' }, '원작처럼 레벨이 오르면 포인트를 얻고(초상화가 반짝임), 게임의 영웅 정보 창(왼쪽 위 초상화) → 특성 탭에서 별 포인트를 써서 올립니다. 전직·직업 능력·주문도 같은 탭 위쪽에 나옵니다. 더 복잡한 효과는 코드 훅 "특성 올림"이나 HeroRuntime.talent("id") 로 만드세요.'),
      F.bool(key, ['nativeTalents'], { label: '게임 원래 특성 창을 그대로 쓰기 (바탕 직업의 특성 — 아래 특성·주문은 창에 안 나옴)' }),
      tierBox, tree, calc, detail];
  }

  PDM.registerEditor({
    id: 'hero', icon: () => '★',
    match: k => k.startsWith('hero:'),
    title: k => { const c = store.get(k); return c ? c.name : k; },
    watch: (ck, tk) => ck === tk || ck === 'project',
    tree() {
      if (!store.isOpen) return [];
      const all = store.all('hero');
      const start = (store.get('project') || {}).startHero;
      return [{ id: 'hero', label: '영웅 (플레이어블)', icon: '★', order: 15, count: all.length,
        menu: [{ label: '새 영웅…', run: newHero }],
        children: all.map(c => ({ id: 'h_' + c.id, label: c.name + (c.id === start ? ' ◀ 시작 영웅' : '') + (c.enabled === false ? ' (꺼짐)' : ''), icon: '', open: 'hero:' + c.id,
          menu: [{ label: '열기', run: () => PDM.tabs.open('hero:' + c.id) }, { label: '시작 영웅으로', run: () => store.edit('project', '시작 영웅', p => { p.startHero = c.id; }) }, { label: '복제', run: () => dupHero(c.id) }, '-',
            { label: '삭제', run: async () => { if (await PDM.ui.confirm(`「${c.name}」 영웅을 삭제할까요?`)) store.remove('hero:' + c.id, '영웅 삭제'); } }] })) }];
    },
    render(key, ctx) {
      const c = store.get(key);
      const { F, section, row, listEditor, field } = PDM.ui;
      const st = ctx.state = ctx.state || { anim: 'idle' };
      ctx.onDispose(() => ctx._stop && ctx._stop());
      const proj = store.get('project') || {};
      const isStart = proj.startHero === c.id;

      // 바탕 직업: 목록 + 직접 입력
      const clsIn = h('input', { type: 'text', value: c.baseClass || '' });
      clsIn.addEventListener('change', () => PDM.ui.commit(key, ['baseClass'], clsIn.value.trim().toUpperCase(), '바탕 직업'));
      const clsDl = null;

      const linked = c.character && store.get('char:' + c.character);

      return h('div', { class: 'page' },
        h('h1', {}, '★ ', c.name, h('span', { class: 'hint', style: { marginLeft: '8px' } }, c.id), isStart ? h('span', { class: 'badge good', style: { marginLeft: '8px' } }, '시작 영웅') : null),
        h('p', { class: 'lead' }, '새 게임을 시작할 때 적용됩니다. 프로젝트 설정의 "시작 영웅"이면 어떤 직업을 고르든 이 영웅이 되고, 아니면 "바탕 직업"을 골랐을 때 이 영웅이 됩니다.'),
        section('기본',
          row(F.text(key, ['name'], { label: '이름', rerender: true }), F.text(key, ['title'], { label: '칭호' }), F.bool(key, ['enabled'], { label: '사용' })),
          F.textarea(key, ['desc'], { label: '설명', rows: 2 }),
          row(field('바탕 직업 (게임 HeroClass)', PDM.ui.combo(clsIn, () => Object.entries(PDM.HERO_CLASSES).map(([k, v]) => [k, v]), { minWidth: 220 }), '전투 방식·갑옷 능력·게임 원래 특성은 이 직업 것을 씁니다 (아래 "특성 (Talent)" 은 따로 더해짐). 모드 직업은 이름을 직접 입력 (예: ARIA)'),
            F.ref(key, ['character'], 'char', { label: '연결된 캐릭터 (대사 화자·초상화)', empty: '(없음)' })),
          h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
            isStart ? h('button', { class: 'btn sm', onclick: () => store.edit('project', '시작 영웅 해제', p => { p.startHero = ''; }) }, '시작 영웅 해제')
              : h('button', { class: 'btn sm pri', onclick: () => store.edit('project', '시작 영웅', p => { p.startHero = c.id; }) }, '이 영웅을 시작 영웅으로'),
            linked ? h('button', { class: 'btn sm', onclick: () => store.edit(key, '캐릭터 그림 가져오기', o => { o.sprite = PDM.clone(linked.sprite); }) }, `「${linked.name}」 그림 가져오기`) : null)),
        section('그림 (영웅 시트)',
          h('p', { class: 'hint' }, '행 = 갑옷 단계(0~6), 열 = 프레임. 비워 두면 바탕 직업의 그림을 씁니다. 프레임 번호는 첫 행 기준이고, 갑옷을 바꾸면 같은 열의 아래 행을 씁니다.'),
          ...PDM.spriteEditor(key, c, ctx, st)),
        section('능력치',
          row(F.num(key, ['stats', 'hp'], { label: '시작 최대 체력', int: true, min: 1, hint: '게임 기본 20' }),
            F.num(key, ['stats', 'hpPerLevel'], { label: '레벨당 체력', int: true, min: 0, hint: '게임 기본 5' }),
            F.num(key, ['stats', 'str'], { label: '힘', int: true, min: 1, hint: '게임 기본 10' }),
            F.num(key, ['startGold'], { label: '시작 골드', int: true, min: 0 })),
          h('div', { class: 'fl', style: { margin: '8px 0 2px' } }, '세부 능력치 (게임 기본값이면 원래대로)'),
          row(F.num(key, ['stats', 'attackSkill'], { label: '명중', int: true, min: 0, def: 10, hint: '기본 10' }),
            F.num(key, ['stats', 'accPerLvl'], { label: '레벨당 명중', int: true, min: 0, def: 1, hint: '기본 1' }),
            F.num(key, ['stats', 'defenseSkill'], { label: '회피', int: true, min: 0, def: 5, hint: '기본 5' }),
            F.num(key, ['stats', 'evaPerLvl'], { label: '레벨당 회피', int: true, min: 0, def: 1, hint: '기본 1' })),
          row(F.num(key, ['stats', 'unarmedMin'], { label: '맨손 최소 피해', int: true, min: 0, def: 0, hint: '0 = 게임 기본 (1)' }),
            F.num(key, ['stats', 'unarmedMax'], { label: '맨손 최대 피해', int: true, min: 0, def: 0, hint: '0 = 게임 기본 (4)' }),
            F.num(key, ['stats', 'speed'], { label: '이동 속도 배율', min: 0.1, step: 0.1, def: 1, hint: '1 = 보통, 2 = 두 배 빠름' }),
            F.num(key, ['stats', 'viewDistance'], { label: '시야', int: true, min: 1, max: 12, def: 8, hint: '기본 8' })),
          F.list(key, ['knownItems'], { label: '처음부터 아는 아이템 (감정됨)', hint: '예: spd:PotionOfHealing, spd:ScrollOfIdentify, 프로젝트 아이템 id' })),
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
            h('div', { class: 'hint', style: { marginBottom: '6px' } }, clear
              ? '이 목록대로만 줍니다 (바탕 직업의 기본 시작 아이템은 주지 않음).'
              : hasGame ? '「게임이 줌」 표시는 바탕 직업이 원래 주는 원작 시작 아이템입니다 (보여 주기만 — 게임이 그대로 줌). 표시 없는 아이템은 거기에 더해 줍니다. 원작 아이템을 바꾸려면 "목록대로 직접 주기"를 누르세요.'
                : '여기 넣은 아이템을 바탕 직업의 기본 시작 아이템에 더해 줍니다.'),
            h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' } },
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
        section('게이지 · 원소 (mod-2 과열 방식)', ...gaugeSection(key, c, st)),
        section('특성 (Talent)', ...talentSection(key, c, st, ctx)),
        section('패시브',
          h('p', { class: 'hint' }, '레벨(과 조건)에 따라 열리는 지속 효과. 더 복잡한 효과는 아래 "코드 (Java)" 의 훅으로 만드세요.'),
          listEditor(key, ['passives'], {
            addLabel: '패시브', emptyText: '패시브가 없습니다',
            make: () => PDM.make.passive(),
            render: (ps, i, p) => h('div', {},
              row(F.text(key, [...p, 'name'], { label: '이름' }), F.num(key, [...p, 'unlockLevel'], { label: '열리는 레벨', int: true, min: 1 }), F.cond(key, [...p, 'cond'], { label: '조건' })),
              F.text(key, [...p, 'desc'], { label: '설명' }),
              listEditor(key, [...p, 'effects'], { addLabel: '효과', compact: true, make: () => ({ stat: 'hp', value: 5 }),
                render: (e, j, ep) => row(F.select(key, [...ep, 'stat'], PDM.PASSIVE_STATS, { label: '효과' }), F.num(key, [...ep, 'value'], { label: '값', int: true })) }))
          })),
        section('코드 (Java) — 세부 동작', ...heroCodeSection(key, c, st, ctx)),
        section('메모', F.textarea(key, ['note'], { rows: 2 })));
    }
  });
  PDM.heroes = { newHero };
})();
