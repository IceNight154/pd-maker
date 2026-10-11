// ================================================================
//  검사 — 끊어진 참조, 조건식 문법 오류, 입구/출구 없는 층 등을 찾습니다.
//  결과: [{ level: 'error'|'warn', where, msg, open(탭 키) }]
// ================================================================
PDM.validate = function () {
  const s = PDM.store, out = [];
  const add = (level, where, msg, open) => out.push({ level, where, msg, open });
  const story = s.get('story') || {}, heart = s.get('heart') || {};
  const has = (kind, id) => {
    if (!id) return true;
    if (kind === 'char') return id === '$hero' || id.startsWith('spd:') || s.has('char:' + id);
    if (kind === 'item') return s.has('item:' + id);
    if (kind === 'event') return s.has('event:' + id);
    if (kind === 'prop') return s.has('prop:' + id);
    if (kind === 'effect') return ((s.get('effects') || {}).list || []).some(x => x.id === id);
    if (kind === 'trailer') return ((s.get('trailers') || {}).list || []).some(x => x.id === id);
    if (kind === 'quest') return ((s.get('quests') || {}).list || []).some(x => x.id === id);
    if (kind === 'badge') return ((s.get('badges') || {}).list || []).some(x => x.id === id);
    if (kind === 'filter') return ((s.get('filters') || {}).list || []).some(x => x.id === id);
    if (kind === 'switch') return (story.switches || []).some(x => x.id === id);
    if (kind === 'var') return (story.variables || []).some(x => x.id === id);
    if (kind === 'route') return (story.routes || []).some(x => x.id === id);
    if (kind === 'ending') return (story.endings || []).some(x => x.id === id);
    if (kind === 'node') return !!PDM.World.node(id);
    if (kind === 'room') return String(id).startsWith('game:') ? (PDM.SPD_ROOMS || []).some(r => 'game:' + r.id === id && !r.noUse) : s.has('room:' + id);
    if (kind === 'heartAction') return (heart.actions || []).some(x => x.key === id);
    if (kind === 'heartRequest') return (heart.requests || []).some(x => x.key === id);
    if (kind === 'topic') return (heart.topics || []).some(x => x.key === id);
    if (kind === 'sound') return !String(id).startsWith('sound:') || (((s.get('sounds') || {}).sounds) || []).some(x => 'sound:' + x.id === id);
    return true;
  };
  const cond = (src, where, open) => { const e = PDM.Cond.check(src); if (e) add('error', where, `조건식 오류 "${src}": ${e}`, open); };
  const PARAM_KIND = { node: 'node', room: 'room', char: 'char', charHero: 'char', item: 'item', event: 'event', switch: 'switch', var: 'var', route: 'route', ending: 'ending', heartAction: 'heartAction', heartRequest: 'heartRequest', topic: 'topic', sound: 'sound' };
  function cmds(list, where, open) {
    (list || []).forEach((c, i) => {
      const def = PDM.COMMANDS[c.cmd];
      const w = `${where} › 명령 ${i + 1}`;
      if (!def) { add('error', w, `알 수 없는 명령 "${c.cmd}" (플러그인이 꺼져 있나요?)`, open); return; }
      def.params.forEach(p => {
        if (PARAM_KIND[p.t] && !has(PARAM_KIND[p.t], c[p.k])) add('error', w, `${def.name}: ${p.label} "${c[p.k]}" 을(를) 찾을 수 없습니다`, open);
        if (p.t === 'cond') cond(c[p.k], w, open);
      });
      if (c.cmd === 'text' && !c.text) add('warn', w, '대사가 비어 있습니다', open);
      cmds(c.then, w + ' (그러면)', open); cmds(c.else, w + ' (그 외)', open); cmds(c.body, w + ' (반복)', open);
      (c.branches || []).forEach((b, bi) => cmds(b, `${w} (선택 ${bi + 1})`, open));
    });
  }

  // 맵 그래프
  const wd = s.get('world') || { groups: [], nodes: [], edges: [] };
  const W_ = PDM.World, I = W_.info();
  const nodeIds = new Set((wd.nodes || []).map(n => n.id));
  if (!wd.start || !nodeIds.has(wd.start)) add('error', '맵 그래프', '시작 노드가 없습니다 (노드 오른쪽 클릭 → 시작 노드로)', 'world');
  (wd.nodes || []).forEach(n => { if (!s.has('node:' + n.id)) add('error', '맵 그래프', `노드 "${n.id}" 의 맵 파일(maps/nodes/${n.id}.json)이 없습니다`, 'world'); if (n.group && !W_.group(n.group)) add('warn', '맵 그래프', `노드 ${n.id} 의 그룹 "${n.group}" 이 없습니다`, 'world'); });
  s.all('node').forEach(f => { if (!nodeIds.has(f.id)) add('warn', `맵 ${f.id}`, '맵 그래프에 없는 노드 파일입니다 (게임에서 쓰이지 않음)', 'node:' + f.id); });
  (wd.edges || []).forEach((e, i) => {
    const w = `연결 ${nodeIds.has(e.from) ? W_.fullName(e.from) : e.from} → ${nodeIds.has(e.to) ? W_.fullName(e.to) : e.to}`;
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) add('error', w, '없는 노드를 가리킵니다', 'world');
    cond(e.cond, w, 'world');
  });
  const blockCheck = (list, where, key) => (list || []).forEach((b, i) => {
    if (b.type === 'room') { if (!b.room) add('error', `${where} › 구성 블럭 ${i + 1}`, '방을 고르지 않았습니다', key); else if (!has('room', b.room)) add('error', `${where} › 구성 블럭 ${i + 1}`, `방 "${b.room}" 없음`, key); cond(b.cond, `${where} › 구성 블럭 ${i + 1}`, key); }
    else if ((b.max || 0) < (b.min || 0) && ['standard', 'special', 'secret'].includes(b.type)) add('warn', `${where} › 구성 블럭 ${i + 1}`, '최대가 최소보다 작습니다 (최소 값으로 만듭니다)', key);
  });
  (wd.groups || []).forEach(g => blockCheck(g.blocks, `그룹 ${g.name}`, 'world'));
  (wd.groups || []).forEach(g => (g.rooms || []).forEach((r, i) => { if (!has('room', r.room)) add('error', `그룹 ${g.name} › 추가 방 ${i + 1}`, `방 템플릿 "${r.room}" 없음`, 'world'); cond(r.cond, `그룹 ${g.name} › 추가 방`, 'world'); }));
  let starts = 0;
  (wd.nodes || []).forEach(n => {
    const f = s.get('node:' + n.id); if (!f) return;
    const k = 'node:' + n.id, where = W_.fullName(n.id);
    if (f.onEnter && !has('event', f.onEnter)) add('error', where, `입장 이벤트 "${f.onEnter}" 없음`, k);
    if (f.entranceTo && !nodeIds.has(f.entranceTo)) add('error', where, `입구 목적지 "${f.entranceTo}" 없음`, k);
    const outs = (wd.edges || []).filter(e => e.from === n.id);
    const mains = outs.filter(e => (e.kind || 'main') === 'main');
    if (f.mode === 'handmade') {
      const t = (f.layers || {}).terrain || [];
      if (t.length !== f.size.w * f.size.h) add('error', where, '타일 수가 크기와 맞지 않습니다', k);
      const incoming = (wd.edges || []).some(e => e.to === n.id) || n.id === wd.start;
      if (incoming && !t.includes(7) && !t.includes(37) && !(f.objects || []).some(o => o.type === 'entrance')) add('error', where, '들어오는 연결이 있는데 입구 계단(<)이 없습니다', k);
      const exits = t.filter(v => v === 8 || v === 21 || v === 22).length + (f.objects || []).filter(o => o.type === 'exit').length;
      if (outs.length && !exits) add('warn', where, '나가는 연결이 있는데 출구 계단(>)이 없습니다', k);
      const P_ = W_.ports(n.id), unused = P_.exits.filter(x => !x.what).length;
      if (unused) add('warn', where, `출구 계단 ${unused}개가 어느 연결에도 쓰이지 않습니다 (통로 연결을 더 만들거나 타일을 지우세요)`, k);
      if (P_.extraOut.length) add('info', where, `통로 ${P_.extraOut.length}개는 출구 타일이 모자라 출구 근처에 계단을 새로 놓습니다`, k);
      if (P_.extraIn.length) add('info', where, `들어오는 통로 ${P_.extraIn.length}개는 입구 타일이 모자라 입구 근처에 계단을 새로 놓습니다`, k);
      const dupIn = {}; P_.entrances.forEach(x => { if (x.what === 'door') dupIn[x.i] = (dupIn[x.i] || 0) + 1; });
      Object.entries(dupIn).forEach(([i, c]) => { if (c > 1) add('warn', where, `입구 ${+i + 1} 을(를) 통로 ${c}개가 함께 씁니다 (돌아갈 때는 그중 하나로)`, k); });
      const sp = f.spawn || {};
      if (sp.enabled && !(sp.mobs || []).length) add('info', where, '몬스터 스폰: 목록이 비어 있어 게임 기본 몬스터가 나옵니다', k);
      (sp.mobs || []).forEach((m, i) => { if (m.ref && !m.ref.startsWith('spd:') && !has('char', m.ref)) add('error', where, `몬스터 스폰 ${i + 1}: 캐릭터 "${m.ref}" 없음`, k); });
    }
    if (!outs.length && !(W_.group(n.group) || {}).safe && I.reached[n.id] !== undefined) add('warn', where, '나가는 연결이 없습니다 — 출구가 온 곳으로 되돌아갑니다 (마지막 맵이면 괜찮음)', 'world');
    if (mains.length > 1 && mains.every(e => !(e.weight > 0) && !e.cond)) add('warn', where, '출구 연결이 여러 개인데 무게가 모두 0입니다', 'world');
    if (I.reached[n.id] === undefined && n.id !== wd.start && !f.entranceTo && !(wd.nodes || []).some(x => (s.get('node:' + x.id) || {}).entranceTo === n.id))
      add('warn', where, '시작 노드에서 닿지 않습니다 (이벤트 "맵 이동"으로만 갈 수 있음)', 'world');
    (f.objects || []).forEach((o, i) => {
      const w = `${where} › 오브젝트 ${i + 1} (${(PDM.OBJECT_TYPES[o.type] || {}).name || o.type})`;
      const kind = { npc: 'char', mob: 'char', item: 'item', event: 'event', plate: 'event', prop: 'prop', effect: 'effect' }[o.type];
      if (kind && !o.ref) add('error', w, '대상이 비어 있습니다', k);
      else if (kind && !has(kind, o.ref)) add('error', w, `"${o.ref}" 을(를) 찾을 수 없습니다`, k);
      if (o.event && !has('event', o.event)) add('error', w, `이벤트 "${o.event}" 없음`, k);
      if (o.type === 'trap' && o.ref && PDM.TRAP_BY_ID && !PDM.TRAP_BY_ID[o.ref]) add('warn', w, `함정 "${o.ref}" 은(는) 원작에 없는 함정입니다 (게임 저장소에 그 클래스가 없으면 놓이지 않음)`, k);
      if (o.at && o.at.x != null && f.mode !== 'procedural' && (o.at.x >= f.size.w || o.at.y >= f.size.h)) add('error', w, '맵 밖에 있습니다', k);
      if (o.at && o.at.x != null && f.mode !== 'procedural') {
        const tt = PDM.TERRAIN_BY_ID[(f.layers.terrain || [])[o.at.y * f.size.w + o.at.x]];
        if (tt && !tt.pass && o.type !== 'event') add('warn', w, `지나갈 수 없는 타일(${tt.name}) 위에 있습니다`, k);
      }
      if (o.type === 'start' && (o.when || 'start') === 'start') starts++;
      cond(o.cond, w, k);
    });
    blockCheck((f.procedural || {}).blocks, where, k);
    ((f.procedural || {}).rooms || []).forEach((r, i) => { if (!has('room', r.room)) add('error', `${where} › 추가 방 ${i + 1}`, `방 템플릿 "${r.room}" 없음`, k); });
  });
  if (starts > 1) add('warn', '맵', `"게임을 시작할 때" 스폰 위치가 ${starts}개 있습니다 (시작 맵의 첫 번째만 사용)`, 'world');
  // 맵 오브젝트
  s.all('prop').forEach(p => {
    const k = 'prop:' + p.id, where = `맵 오브젝트 ${p.name}`;
    if (!(p.sprite || {}).sheet) add('warn', where, '그림(스프라이트 시트)이 없습니다 — 게임에서 기본 그림으로 보입니다', k);
    if (!(p.states || []).length) add('error', where, '상태가 하나도 없습니다', k);
    if (p.pushable && !(p.states || []).some(x => x.solid !== false)) add('warn', where, '밀 수 있지만 막힌 상태가 없어 밀 수 없습니다 (지나갈 수 있는 상태에서는 그냥 밟고 지나감)', k);
    [p.event, p.stepEvent, (p.goal || {}).event].forEach(e => { if (e && !has('event', e)) add('error', where, `이벤트 "${e}" 없음`, k); });
    cond(p.cond, where, k);
  });
  // 방 템플릿
  const DOORS = [5, 6, 10, 16, 31];
  s.all('room').forEach(r => {
    const k = 'room:' + r.id, where = `방 템플릿 ${r.name}`, W = r.size.w, H = r.size.h, t = (r.layers || {}).terrain || [];
    if (W < 5 || H < 5 || W > 18 || H > 18) add('error', where, `크기는 5~18칸이어야 합니다 (지금 ${W}×${H})`, k);
    if (t.length !== W * H) { add('error', where, '타일 수가 크기와 맞지 않습니다', k); return; }
    let doors = 0, leaks = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x && y && x < W - 1 && y < H - 1) continue;
      const v = t[y * W + x];
      if (DOORS.includes(v)) doors++; else if ((PDM.TERRAIN_BY_ID[v] || {}).pass) leaks++;
    }
    if (leaks) add('warn', where, `테두리에 지나갈 수 있는 타일이 ${leaks}칸 있습니다. 테두리는 벽이나 문으로 두세요`, k);
    if (r.kind === 'special' && doors > 1) add('warn', where, '특수 방은 문이 하나만 연결됩니다 (문 자리 중 하나가 쓰임)', k);
    if (t.includes(7) || t.includes(8)) add('warn', where, '방 템플릿 안의 계단은 장식 바닥으로 바뀝니다', k);
    (r.objects || []).forEach((o, i) => { if (o.at && (o.at.x >= W || o.at.y >= H)) add('error', where, `오브젝트 ${i + 1} 이(가) 방 밖에 있습니다`, k); });
  });
  // 캐릭터
  s.all('char').forEach(c => {
    const k = 'char:' + c.id, where = `캐릭터 ${c.name}`;
    if (!c.sprite || !c.sprite.sheet) add('warn', where, '스프라이트 시트가 없습니다 (게임에서 기본 모습으로 보임)', k);
    (c.heart && c.heart.traits || []).forEach(t => { if (!(heart.traits || []).some(x => x.key === t)) add('warn', where, `없는 성격 "${t}"`, k); });
    Object.entries(c.dialogue || {}).forEach(([tp, lines]) => (lines || []).forEach((l, i) => cond(l.when, `${where} › 대사 ${tp} ${i + 1}`, k)));
    Object.entries(c.behaviors || {}).forEach(([hk, list]) => cmds(list, `${where} › ${PDM.BEHAVIOR_HOOKS[hk] || hk}`, k));
    (c.hero && c.hero.startItems || []).forEach(si => { if (!has('item', si.item)) add('error', where, `시작 아이템 "${si.item}" 없음`, k); });
    const exKeys = (c.portrait && c.portrait.expressions || []).map(e => e.key);
    Object.values(c.dialogue || {}).flat().forEach(l => { if (l && l.face && !exKeys.includes(l.face)) add('warn', where, `대사에 쓴 표정 "${l.face}" 이(가) 표정 목록에 없습니다`, k); });
  });
  // 아이템
  s.all('item').forEach(it => cmds(it.onUse, `아이템 ${it.name} › 사용`, 'item:' + it.id));
  s.all('item').forEach(it => {
    if (it.kind !== 'codex') return;
    const cx = it.codex || {}, w = `아이템 ${it.name} › 코덱스`, k = 'item:' + it.id;
    if (!(cx.baseUses > 0)) add('error', w, '내구(사용 횟수)가 0입니다', k);
    if ((cx.max || 0) < (cx.min || 0)) add('warn', w, '최대 피해가 최소보다 작습니다', k);
    if (!(cx.max > 0) && !(cx.effects || []).length) add('warn', w, '피해도 추가 효과도 없습니다', k);
    (cx.effects || []).forEach(e => { if (e.type === 'code') add('error', w, '코덱스 효과에는 "코드"를 쓸 수 없습니다 (아이템 코드 훅을 쓰세요)', k); });
  });
  // 이벤트
  s.all('event').forEach(e => (e.pages || []).forEach((p, pi) => {
    const where = `이벤트 ${e.name} › 페이지 ${pi + 1}`, k = 'event:' + e.id;
    cond(p.cond, where, k);
    if (p.trigger === 'heart') { if (!has('char', p.heartChar)) add('error', where, '마음 조건 대상 캐릭터가 없습니다', k); cond(p.heartCond, where, k); }
    cmds(p.commands, where, k);
  }));
  // 스토리
  if (story.startEvent && !has('event', story.startEvent)) add('error', '스토리', `시작 이벤트 "${story.startEvent}" 없음`, 'story');
  (story.beats || []).forEach((b, i) => { if (b.event && !has('event', b.event)) add('error', `스토리 비트 ${i + 1}`, `이벤트 "${b.event}" 없음`, 'story'); });
  (story.endings || []).forEach(e => { cond(e.when, `엔딩 ${e.name}`, 'story'); if (e.scene && !has('event', e.scene)) add('error', `엔딩 ${e.name}`, `장면 "${e.scene}" 없음`, 'story'); });
  const ids = [...(story.switches || []), ...(story.variables || [])].map(x => x.id);
  ids.filter((x, i) => ids.indexOf(x) !== i).forEach(x => add('error', '스토리', `스위치/변수 id 중복: ${x}`, 'story'));
  // 마음 시스템
  (heart.attitudes || []).forEach(a => cond(a.when, `${PDM.T('rel.attitude')} ${PDM.T(a.key)}`, 'heart'));
  (heart.milestones || []).forEach(m => { cond(m.when, `이정표 ${PDM.T(m.key)}`, 'heart'); if (m.event && !has('event', m.event)) add('error', `이정표 ${PDM.T(m.key)}`, `이벤트 "${m.event}" 없음`, 'heart'); });
  (heart.requests || []).forEach((q, i) => {
    const w = `부탁 ${q.name || i + 1}`;
    cond(q.when, w, 'heart');
    ['okAction', 'noAction'].forEach(k => { if (q[k] && !has('heartAction', q[k])) add('error', w, `행동 "${q[k]}" 없음`, 'heart'); });
    if (q.event && !has('event', q.event)) add('error', w, `이벤트 "${q.event}" 없음`, 'heart');
  });
  (heart.actions || []).forEach(a => cond(a.when, `행동 ${a.name}`, 'heart'));
  (heart.milestones || []).forEach(m => { cond(m.blockedBy, `이정표 ${m.key}`, 'heart'); });
  (heart.counters || []).forEach((c, i) => { cond(c.when, `반응 ${i + 1}`, 'heart'); if (c.action && !has('heartAction', c.action)) add('error', `반응 ${i + 1}`, `행동 "${c.action}" 없음`, 'heart'); });
  const hero = (s.get('project') || {}).startHero;
  if (hero && !s.has('hero:' + hero)) add('error', '프로젝트', `시작 영웅 "${hero}" 없음 (영웅 편집기)`, 'project');
  // 영웅
  s.all('item').forEach(it => {
    if (it.category && !PDM.ITEM_CATEGORIES[it.category]) add('warn', `아이템 ${it.name}`, `분류 "${it.category}" 이(가) 목록에 없습니다 (기타로 보임)`, 'item:' + it.id);
  });
  // 타이틀 화면
  const tt = s.get('title');
  if (tt && tt.enabled !== false) {
    ((tt.music || {}).tracks || []).forEach(r => { if (r && r !== 'none' && !has('sound', r)) add('error', '타이틀 화면', `음악 "${r}" 이(가) 사운드 목록에 없습니다`, 'title'); });
    (tt.layers || []).forEach((l, i) => { if (!l.image) add('warn', `타이틀 화면 › 레이어 ${l.name || i + 1}`, '그림이 비어 있습니다', 'title'); });
    if ((tt.logo || {}).mode === 'image' && !tt.logo.image) add('warn', '타이틀 화면 › 로고', '로고 그림이 비어 있습니다', 'title');
    if ((tt.menus || {}).effect && ((tt.background || {}).effect || 'none') === 'none') add('warn', '타이틀 화면 › 메뉴 화면', '"입자 효과도"를 켰지만 배경의 날씨·입자 효과가 없습니다', 'title');
    ((tt.buttons || {}).items || []).forEach(b => { if (b.action === 'url' && !b.url) add('warn', `타이틀 화면 › 버튼 ${b.label || b.id}`, '주소가 비어 있습니다', 'title'); });
    if (!((tt.buttons || {}).items || []).some(b => (b.id === 'play' && b.visible !== false) || b.action === 'newgame' || b.action === 'continue')) add('error', '타이틀 화면', '게임을 시작할 버튼이 없습니다 ("던전으로 들어가기"를 숨겼다면 새 게임 동작 버튼을 넣으세요)', 'title');
  }
  s.all('hero').forEach(hr => {
    const k = 'hero:' + hr.id, where = `영웅 ${hr.name}`;
    if (hr.character && !s.has('char:' + hr.character)) add('error', where, `연결된 캐릭터 "${hr.character}" 없음`, k);
    ((hr.inventory || {}).items || []).forEach((it, i) => {
      if (!it.item) add('warn', `${where} › 시작 아이템 ${i + 1}`, '아이템이 비어 있습니다', k);
      else if (!it.item.startsWith('spd:') && !s.has('item:' + it.item)) add('error', `${where} › 시작 아이템 ${i + 1}`, `아이템 "${it.item}" 없음`, k);
    });
    const spells = hr.spells || hr.skills || [], abis = hr.abilities || [], subs = hr.subclasses || [];
    const sids = [], aids = [], scids = [];
    const castCheck = (sk, w) => {
      if (!(sk.effects || []).length) add('warn', w, '효과가 없습니다', k);
      cond(sk.cond, w, k);
      (sk.effects || []).forEach(e => { if (e.type === 'event' && !has('event', e.event)) add('error', w, `이벤트 "${e.event}" 없음`, k); });
      [sk.sound, sk.hitSound].forEach(r => { if (r && !has('sound', r)) add('error', w, `소리 "${r}" 이(가) 사운드 목록에 없습니다`, k); });
      if (sk.heat && !(hr.gauge || {}).enabled) add('warn', w, '게이지 변화가 있지만 게이지를 쓰지 않습니다', k);
    };
    subs.forEach((x, i) => { const w = `${where} › 전직 ${x.name || i + 1}`; if (scids.includes(x.id)) add('error', w, `전직 id "${x.id}" 가 겹칩니다`, k); scids.push(x.id); });
    if (subs.length === 1) add('warn', `${where} › 전직`, '전직이 하나뿐입니다 (원작은 둘~셋 중 고름)', k);
    abis.forEach((x, i) => {
      const w = `${where} › 직업 능력 ${x.name || i + 1}`;
      if (aids.includes(x.id)) add('error', w, `직업 능력 id "${x.id}" 가 겹칩니다`, k); aids.push(x.id);
      if (!(x.chargeUse >= 0 && x.chargeUse <= 100)) add('warn', w, '갑옷 충전 소모는 0~100% 입니다', k);
      castCheck(x, w);
    });
    spells.forEach((sk, i) => {
      const w = `${where} › 주문 ${sk.name || i + 1}`;
      if (sids.includes(sk.id)) add('error', w, `주문 id "${sk.id}" 가 겹칩니다`, k); sids.push(sk.id);
      if (aids.includes(sk.id)) add('error', w, `주문 id "${sk.id}" 가 직업 능력 id 와 겹칩니다 (특성 보정이 섞임)`, k);
      castCheck(sk, w);
      if (sk.subclass && !scids.includes(sk.subclass)) add('error', w, `전직 "${sk.subclass}" 없음`, k);
      if (sk.ability && !aids.includes(sk.ability)) add('error', w, `직업 능력 "${sk.ability}" 없음`, k);
      if ((hr.spellbook || {}).charges === 0 && sk.cost > 0) add('warn', w, '주문서 최대 충전이 0이라 쓸 수 없습니다', k);
    });
    if (spells.length && (hr.spellbook || {}).enabled === false) add('warn', `${where} › 주문`, '주문서를 주지 않아 주문을 쓸 곳이 없습니다 (영웅 창 특성 탭에서만 시전)', k);
    const g = hr.gauge || {};
    if (g.enabled) {
      const w = `${where} › 게이지`;
      if (!(g.max > 0)) add('error', w, '최대가 0입니다', k);
      const eids = (g.elements || []).map(e => e.id);
      eids.forEach((id, i) => { if (eids.indexOf(id) !== i) add('error', w, `원소 id "${id}" 가 겹칩니다`, k); });
      if ((g.levels || []).some(l => l.at > g.max)) add('warn', w, '최대보다 높은 단계가 있습니다', k);
    }
    (hr.passives || []).forEach((p, i) => cond(p.cond, `${where} › 패시브 ${p.name || i + 1}`, k));
    // 특성
    const tids = (hr.talents || []).map(t => t.id), ntier = (hr.talentTiers || []).length || 4;
    spells.forEach(sk => {
      if (sk.requiresTalent && !tids.includes(sk.requiresTalent)) add('error', `${where} › 주문 ${sk.name}`, `필요한 특성 "${sk.requiresTalent}" 없음`, k);
    });
    const codexIds = s.all('item').filter(x => x.kind === 'codex').map(x => x.id);
    (hr.talents || []).forEach((t, i) => {
      const w = `${where} › 특성 ${t.name || i + 1}`;
      if (tids.indexOf(t.id) !== i) add('error', w, `특성 id "${t.id}" 가 겹칩니다`, k);
      if (!(t.tier >= 1 && t.tier <= ntier)) add('error', w, `단계 ${t.tier} 가 없습니다 (1~${ntier})`, k);
      if (t.requires && !tids.includes(t.requires)) add('error', w, `먼저 필요한 특성 "${t.requires}" 없음`, k);
      if (t.requires === t.id) add('error', w, '자기 자신을 먼저 필요로 합니다', k);
      if (t.subclass && !scids.includes(t.subclass)) add('error', w, `전직 "${t.subclass}" 없음`, k);
      if (t.ability && !aids.includes(t.ability)) add('error', w, `직업 능력 "${t.ability}" 없음`, k);
      if (!(t.effects || []).length) add('warn', w, '효과가 없습니다 (코드 훅에서 HeroRuntime.talent 로 쓰는 경우는 괜찮음)', k);
      (t.effects || []).forEach(e => {
        const ref = e.spell ?? e.skill;
        if (e.type === 'unlockSpell' && !sids.includes(ref)) add('error', w, `주문 "${ref || '(비어 있음)'}" 없음`, k);
        if (e.type === 'spell' && ref !== '*' && !sids.includes(ref) && !aids.includes(ref) && !codexIds.includes(ref)) add('error', w, `주문·능력·코덱스 "${ref || '(비어 있음)'}" 없음`, k);
      });
    });
    (hr.talentTiers || []).forEach((tr, i) => { if (i && tr.unlockLevel < hr.talentTiers[i - 1].unlockLevel) add('warn', `${where} › 특성 ${tr.name}`, '앞 단계보다 먼저 열립니다', k); });
    // 코드 (괄호 짝 등 간단 검사 — 진짜 오류는 컴파일 때 로그에)
    const cg = PDM.codegen;
    if (cg) {
      Object.entries(hr.code || {}).forEach(([hook, src]) => lint(src, `${where} › 코드 ${hook}`, k));
      [...spells, ...abis].forEach(sk => (sk.effects || []).forEach((e, j) => { if (e.type === 'code') lint(e.code, `${where} › ${sk.name} › 효과 ${j + 1} (코드)`, k); }));
      (hr.knownItems || []).forEach(id => { if (!String(id).startsWith('spd:') && !s.has('item:' + id)) add('error', `${where} › 처음부터 아는 아이템`, `아이템 "${id}" 없음`, k); });
    }
  });
  // 소리: 배경음 참조 · 파일
  ((s.get('world') || {}).groups || []).forEach(g => {
    [g.bgm, g.bgmTense, g.bgmBoss, ...(g.bgmExtra || [])].forEach(r => { if (r && !has('sound', r)) add('error', `그룹 ${g.name}`, `음악 "${r}" 이(가) 사운드 목록에 없습니다`, 'world'); });
    if (g.bgmTense) cond(g.bgmTenseWhen, `그룹 ${g.name} › 긴장 음악 조건`, 'world');
    if (g.bgmTense && !g.bgmTenseWhen) add('warn', `그룹 ${g.name}`, '긴장 음악은 조건이 있어야 나옵니다', 'world');
  });
  s.keys('node').forEach(k => { const n = s.get(k); if (n && n.bgm && !has('sound', n.bgm)) add('error', `맵 ${PDM.World.fullName(k.slice(5))}`, `배경음 "${n.bgm}" 이(가) 사운드 목록에 없습니다`, k); });
  (((s.get('sounds') || {}).sounds) || []).forEach(x => {
    if (!x.file) add('error', `소리 ${x.name || x.id}`, '파일이 비어 있습니다', 'sounds');
    else if (!/^game:|^assets\//.test(x.file)) add('warn', `소리 ${x.name || x.id}`, `파일 "${x.file}" 은 프로젝트 assets/ 안에 있어야 게임과 함께 배포됩니다`, 'sounds');
    else if (!/\.(ogg|mp3|wav)$/i.test(x.file)) add('error', `소리 ${x.name || x.id}`, 'ogg, mp3, wav 만 게임에서 재생됩니다', 'sounds');
  });
  // 아이템 코드
  function lint(src, w, k) {
    if (typeof src !== 'string' || !src.trim()) return;
    PDM.codegen.lint(src).forEach(e => add('error', w, `${e.line}번째 줄: ${e.msg}`, k));
  }
  if (PDM.codegen) s.all('item').forEach(it => {
    const k = 'item:' + it.id, where = `아이템 ${it.name}`;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(it.id) && PDM.codegen.itemNeedsClass(it)) add('warn', where, `id "${it.id}" 에 영문·숫자·_ 외의 글자가 있어 클래스 이름이 바뀝니다 (${PDM.codegen.itemClass(it.id)})`, k);
    const hooks = PDM.codegen.ITEM_HOOKS;
    const kind = it.kind || 'misc';
    Object.entries(it.code || {}).forEach(([hk, src]) => {
      const def = hooks.find(x => x.key === hk);
      if (def && !def.kinds.includes(kind) && typeof src === 'string' && src.trim()) add('warn', `${where} › 코드 ${hk}`, `종류가 "${PDM.ITEM_KINDS[kind]}" 이면 쓰이지 않는 코드입니다`, k);
      lint(src, `${where} › 코드 ${hk}`, k);
    });
    const ids = [];
    (it.actions || []).forEach((a, i) => {
      const w = `${where} › 행동 ${a.name || i + 1}`;
      if (!a.id) add('error', w, 'id 가 비어 있습니다', k);
      else if (ids.includes(a.id)) add('error', w, `id "${a.id}" 가 겹칩니다`, k);
      ids.push(a.id);
      if (!String(a.code || '').trim()) add('warn', w, '코드가 비어 있어 버튼이 나오지 않습니다', k);
      cond(a.cond, w, k); lint(a.code, w, k);
    });
    if ((kind === 'melee' || kind === 'missile') && it.weapon && it.weapon.max < it.weapon.min) add('warn', where, '최대 피해가 최소보다 작습니다', k);
    if (kind === 'armor' && it.armor && it.armor.drMax < it.armor.drMin) add('warn', where, '최대 방어가 최소보다 작습니다', k);
  });
  return out;
};
