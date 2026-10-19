// ================================================================
//  캐릭터 AI · 공격 프로필 규칙 (8차) — 편집기(AI 편집 · 시뮬레이터)와 런타임(MakerAIModel.java)이 같은 규칙
//    데이터  characters/<id>.json  combat { version: 1, enabled, detect, behaviors: [행동], attacks: [공격] }
//            combat 이 없거나 enabled=false 이거나 검사 오류가 있으면 게임은 원래 AI · 원래 공격 그대로 (MakerCharAI)
//    행동    { id, name, enabled, priority, when(조건), action, attack, dist, amount, say, target, cooldown, chance, weight, delay, next, fail, interrupt, on }
//    공격    { id, name, type: melee|ranged|area, range, radius, windup, recovery, mult, flat, acc, crit, critMult, hits, cooldown, hpCost,
//              knockback, stun, status, statusTurns, filter, friendlyFire, projectile, anim, effect, sound }
//    조건    { op: and|or, not, items: [조건] } | { k, cmp, v, not }
//    상황    { turn, self: T, targets: { enemy, hero, nearestEnemy, weakestEnemy, weakestAlly, self }: T|null, allies, enemies,
//              ev: { hit, attacked, targetLost }, cd: { 'b:<행동>' | 'a:<공격>': 다시 쓸 수 있는 턴 }, next: 이어서 할 행동 id, rolls: [0~1 난수] }
//            T = { hp, ht, dist, visible, line(투사체가 닿음), st: [상태] }
//    시간    모두 게임 턴 (Actor.TICK = 1). 준비(windup) · 회복(recovery) · 대기(delay) · 재사용(cooldown) 도 턴
//    고르기  우선순위가 높은 것부터 검사 → 통과한 것 중 가장 높은 우선순위 묶음에서 가중치로 하나 (묶음에 하나면 그것).
//            이어서 할 행동(next · fail)이 있으면 그것을 맨 먼저 검사하고 통과하면 바로 고름. 난수는 rolls 를 앞에서부터 씀 (조건의 확률 → 행동의 확률 → 가중치)
//    순수 함수 — 런타임 MakerAIModel 과 같은 입력이면 같은 결과 (tools/tests/run.js 가 Java 를 실제로 실행해 비교)
// ================================================================
(function () {
  const ACTIONS = ['attack', 'approach', 'retreat', 'keep', 'flee', 'wander', 'patrol', 'wait', 'heal', 'protect', 'say', 'default'];
  const TARGETS = ['enemy', 'hero', 'nearestEnemy', 'weakestEnemy', 'weakestAlly', 'self'];
  const TYPES = ['melee', 'ranged', 'area'];
  const KEYS = ['hp', 'targetHp', 'dist', 'visible', 'line', 'hasTarget', 'chance', 'turn', 'event', 'allies', 'enemies', 'status', 'targetStatus', 'ready'];
  const CMPS = ['<', '<=', '>', '>=', '==', '!='];
  const EVENTS = ['hit', 'attacked', 'targetLost'];
  const ONS = ['', 'hit', 'attacked', 'targetLost', 'death'];
  const STATUS = ['burning', 'poison', 'slow', 'weak', 'cripple', 'bleed', 'blind', 'vertigo', 'roots', 'frost'];
  const FILTERS = ['enemies', 'allies', 'all'];
  const NEEDS_TARGET = ['attack', 'approach', 'retreat', 'keep', 'flee', 'protect'];
  const STR_KEYS = ['event', 'status', 'targetStatus', 'ready'];
  const BOOL_KEYS = ['visible', 'line', 'hasTarget'];

  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const num = (o, k, d) => { const v = isObj(o) ? o[k] : undefined; if (typeof v === 'number') return Number.isFinite(v) ? v : d; if (typeof v === 'string' && v.trim() !== '') { const n = Number(v.trim()); return Number.isFinite(n) ? n : d; } return d; };
  const str = (o, k, d) => { const v = isObj(o) ? o[k] : undefined; return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : d; };
  const bool = (o, k, d) => { const v = isObj(o) ? o[k] : undefined; return typeof v === 'boolean' ? v : d; };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cnum = (o, k, d, lo, hi) => clamp(num(o, k, d), lo, hi);
  const cint = (o, k, d, lo, hi) => clamp(Math.round(num(o, k, d)), lo, hi);
  const pick = (o, k, list, d) => { const v = str(o, k, d); return list.includes(v) ? v : d; };
  const objs = a => Array.isArray(a) ? a.filter(isObj) : [];

  // ------------------------------------------------------------ 정리 (빠진 값 = 기본값 · 범위 밖 = 범위 안으로 · 모르는 값 = 기본)
  function normAttack(a) {
    const type = pick(a, 'type', TYPES, 'melee');
    return {
      id: str(a, 'id', ''), name: str(a, 'name', ''), type,
      range: cint(a, 'range', type === 'melee' ? 1 : 4, 1, 20), radius: cint(a, 'radius', 1, 0, 6),
      windup: cnum(a, 'windup', 0, 0, 10), recovery: cnum(a, 'recovery', 0, 0, 10),
      mult: cnum(a, 'mult', 1, 0, 20), flat: cint(a, 'flat', 0, -999, 999), acc: cnum(a, 'acc', 1, 0, 10),
      crit: cnum(a, 'crit', 0, 0, 100), critMult: cnum(a, 'critMult', 1.5, 1, 10), hits: cint(a, 'hits', 1, 1, 10),
      cooldown: cnum(a, 'cooldown', 0, 0, 100), hpCost: cint(a, 'hpCost', 0, 0, 9999),
      knockback: cint(a, 'knockback', 0, 0, 10), stun: cnum(a, 'stun', 0, 0, 20),
      status: pick(a, 'status', ['', ...STATUS], ''), statusTurns: cnum(a, 'statusTurns', 3, 1, 50),
      filter: pick(a, 'filter', FILTERS, 'enemies'), friendlyFire: bool(a, 'friendlyFire', false), projectile: bool(a, 'projectile', true),
      anim: pick(a, 'anim', ['attack', 'zap'], type === 'ranged' ? 'zap' : 'attack'), effect: str(a, 'effect', ''), sound: str(a, 'sound', '')
    };
  }
  function normCond(c, depth) {
    if (!isObj(c) || depth > 8) return null;
    if (Array.isArray(c.items)) return { op: pick(c, 'op', ['and', 'or'], 'and'), not: bool(c, 'not', false), items: c.items.map(x => normCond(x, depth + 1)).filter(Boolean) };
    const k = pick(c, 'k', KEYS, '?');
    return { k, cmp: pick(c, 'cmp', CMPS, '>='), v: STR_KEYS.includes(k) ? str(c, 'v', '') : num(c, 'v', 0), not: bool(c, 'not', false) };
  }
  function normBehavior(b) {
    return {
      id: str(b, 'id', ''), name: str(b, 'name', ''), enabled: bool(b, 'enabled', true), priority: cnum(b, 'priority', 0, -1000, 1000),
      when: normCond(b.when, 0), action: pick(b, 'action', ACTIONS, 'default'), attack: str(b, 'attack', ''),
      dist: cint(b, 'dist', 3, 1, 20), amount: cint(b, 'amount', 5, 0, 9999), say: str(b, 'say', ''), target: pick(b, 'target', TARGETS, 'enemy'),
      cooldown: cnum(b, 'cooldown', 0, 0, 1000), chance: cnum(b, 'chance', 100, 0, 100), weight: cnum(b, 'weight', 1, 0, 1000),
      delay: cnum(b, 'delay', 0, 0, 20), next: str(b, 'next', ''), fail: str(b, 'fail', ''), interrupt: bool(b, 'interrupt', true), on: pick(b, 'on', ONS, '')
    };
  }
  function normalize(p) {
    return { _n: true, version: cint(p, 'version', 1, 1, 1000), enabled: bool(p, 'enabled', true), detect: cint(p, 'detect', 8, 1, 30),
      attacks: objs(isObj(p) ? p.attacks : null).map(normAttack), behaviors: objs(isObj(p) ? p.behaviors : null).map(normBehavior) };
  }

  /** 이미 정리한 프로필이면 그대로 */
  const N = p => p && p._n === true ? p : normalize(p);

  // ------------------------------------------------------------ 조건
  function cmp(a, op, b) { switch (op) { case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; case '==': return a === b; default: return a !== b; } }
  const pct = t => t && t.ht > 0 ? t.hp / t.ht * 100 : 0;
  /** 조건 하나 → { ok, items? } (모든 자식을 끝까지 계산 — 확률 조건의 난수 쓰는 순서를 런타임과 같게) */
  function evalCond(c, ctx) {
    if (!c) return { ok: true };
    if (c.items) {
      const parts = c.items.map(x => evalCond(x, ctx));
      let ok = c.op === 'or' ? parts.some(x => x.ok) : parts.every(x => x.ok);
      if (c.items.length === 0) ok = true;
      return { ok: c.not ? !ok : ok, items: parts };
    }
    const s = ctx.sit, T = ctx.T;
    let ok;
    switch (c.k) {
      case 'hp': ok = cmp(pct(s.self), c.cmp, c.v); break;
      case 'targetHp': ok = !!T && cmp(pct(T), c.cmp, c.v); break;
      case 'dist': ok = !!T && cmp(T.dist, c.cmp, c.v); break;
      case 'visible': ok = !!T && !!T.visible; break;
      case 'line': ok = !!T && !!T.line; break;
      case 'hasTarget': ok = !!T; break;
      case 'chance': ok = ctx.roll() * 100 < c.v; break;
      case 'turn': ok = cmp(s.turn, c.cmp, c.v); break;
      case 'event': ok = !!(s.ev || {})[c.v]; break;
      case 'allies': ok = cmp(s.allies || 0, c.cmp, c.v); break;
      case 'enemies': ok = cmp(s.enemies || 0, c.cmp, c.v); break;
      case 'status': ok = ((s.self || {}).st || []).includes(c.v); break;
      case 'targetStatus': ok = !!T && (T.st || []).includes(c.v); break;
      case 'ready': ok = !((s.cd || {})['a:' + c.v] > s.turn); break;
      default: ok = false;
    }
    return { ok: c.not ? !ok : ok };
  }

  // ------------------------------------------------------------ 고르기
  /** 상황을 숫자 · 목록으로 정리 (빠진 칸 = 없음) */
  function normSit(s) {
    const T = t => isObj(t) ? { hp: num(t, 'hp', 0), ht: num(t, 'ht', 1), dist: num(t, 'dist', 0), visible: bool(t, 'visible', true), line: bool(t, 'line', true), st: Array.isArray(t.st) ? t.st.filter(x => typeof x === 'string') : [] } : null;
    const tg = isObj(s && s.targets) ? s.targets : {}, targets = {};
    for (const k of TARGETS) targets[k] = T(tg[k]);
    const self = T(s && s.self) || { hp: 1, ht: 1, dist: 0, visible: true, line: true, st: [] };
    if (!targets.self) targets.self = Object.assign({}, self, { dist: 0 });
    const ev = {}; for (const e of EVENTS) ev[e] = !!(isObj(s && s.ev) && s.ev[e] === true);
    const cd = {}; if (isObj(s && s.cd)) for (const [k, v] of Object.entries(s.cd)) if (typeof v === 'number' && Number.isFinite(v)) cd[k] = v;
    return { turn: num(s, 'turn', 0), self, targets, allies: num(s, 'allies', 0), enemies: num(s, 'enemies', 0), ev, cd, next: str(s, 'next', ''),
      rolls: Array.isArray(s && s.rolls) ? s.rolls.filter(x => typeof x === 'number' && Number.isFinite(x)) : [] };
  }
  /** 행동 하나를 지금 할 수 있는지 → 이유 코드 ('ok' = 할 수 있음) */
  function check(P, b, sit, ctx) {
    if (!b.enabled) return 'disabled';
    if (b.on === 'death') return 'death';
    if (b.on && !sit.ev[b.on]) return 'event';
    if (sit.cd['b:' + b.id] > sit.turn) return 'cooldown';
    const T = b.target === 'self' ? sit.targets.self : sit.targets[b.target];
    const need = NEEDS_TARGET.includes(b.action);
    if (need && !T) return 'noTarget';
    ctx.T = T;
    const c = evalCond(b.when, ctx);
    ctx.conds[b.id] = c;
    if (!c.ok) return 'cond';
    if (b.action === 'attack') {
      const A = P.attacks.find(a => a.id === b.attack);
      if (!A) return 'noAttack';
      if (sit.cd['a:' + A.id] > sit.turn) return 'attackCd';
      if (T.dist > A.range) return 'range';
      if (A.type === 'ranged' && A.projectile && !T.line) return 'line';
      if (A.hpCost > 0 && A.hpCost >= sit.self.hp) return 'cost';
    }
    if (b.chance < 100 && !(ctx.roll() * 100 < b.chance)) return 'chance';
    return 'ok';
  }
  /** 이번 차례에 할 행동 → { id, action, attack, target, reason, trace: [{ id, why }], conds, rolls(쓴 난수 수) } — id null = 원래 AI */
  function decide(profile, situation) {
    const P = N(profile), sit = normSit(situation);
    let used = 0;
    const ctx = { sit, T: null, conds: {}, roll: () => { const r = sit.rolls.length ? sit.rolls[used % sit.rolls.length] : 0.5; used++; return r; } };
    const trace = [];
    const done = (b, reason) => { const A = b && b.action === 'attack' ? P.attacks.find(a => a.id === b.attack) || null : null; return { id: b ? b.id : null, action: b ? b.action : 'default', attack: A ? A.id : '', target: b ? b.target : '', reason, trace, conds: ctx.conds, rolls: used }; };
    if (!P.enabled) return done(null, 'disabled');
    const order = P.behaviors.map((b, i) => [b, i]).sort((x, y) => y[0].priority - x[0].priority || x[1] - y[1]).map(x => x[0]);
    let chained = '';
    if (sit.next) {   // 이어서 할 행동 — 맨 먼저 (통과하지 못하면 아래에서 다시 검사하지 않음)
      const nb = P.behaviors.find(b => b.id === sit.next);
      if (nb) {
        chained = nb.id;
        const why = check(P, nb, sit, ctx);
        trace.push({ id: nb.id, why: why === 'ok' ? 'chain' : why });
        if (why === 'ok') return done(nb, 'chain');
      }
    }
    const cand = []; let level = null;
    for (const b of order) {
      if (chained && b.id === chained) continue;   // 이미 이어서 할 행동으로 검사함
      if (level !== null && b.priority < level) { trace.push({ id: b.id, why: 'lower' }); continue; }
      const why = check(P, b, sit, ctx);
      trace.push({ id: b.id, why });
      if (why === 'ok') { cand.push(b); level = b.priority; }
    }
    if (!cand.length) return done(null, P.behaviors.length ? 'none' : 'empty');
    if (cand.length === 1) return done(cand[0], 'chosen');
    const total = cand.reduce((a, b) => a + b.weight, 0);
    if (total <= 0) return done(cand[0], 'chosen');
    let r = ctx.roll() * total;
    for (const b of cand) { r -= b.weight; if (r < 0) return done(b, 'weighted'); }
    return done(cand[cand.length - 1], 'weighted');
  }
  /** 행동을 한 뒤 → 다음 상황의 재사용 대기(cd) · 이어서 할 행동(next). ok = 그 행동이 실제로 됐는지 (공격이 대상 없이 끝남 · 막힘 = false) */
  function after(profile, situation, id, ok) {
    const P = N(profile), s = normSit(situation);
    const cd = Object.assign({}, s.cd), b = P.behaviors.find(x => x.id === id);
    if (!b) return { cd, next: '' };
    if (b.cooldown > 0) cd['b:' + b.id] = s.turn + b.cooldown;
    const A = b.action === 'attack' ? P.attacks.find(a => a.id === b.attack) : null;
    if (A && ok && A.cooldown > 0) cd['a:' + A.id] = s.turn + A.cooldown;
    return { cd, next: ok ? b.next : b.fail };
  }
  /** 행동 한 번이 쓰는 턴: 공격 = 준비 + 1(공격) + 회복, 그 밖 = 1 · 둘 다 + 대기 (런타임이 같은 값을 spend) */
  function turns(profile, id) {
    const P = N(profile), b = P.behaviors.find(x => x.id === id);
    if (!b) return 1;
    const A = b.action === 'attack' ? P.attacks.find(a => a.id === b.attack) : null;
    return (A ? A.windup + 1 + A.recovery : 1) + b.delay;
  }

  // ------------------------------------------------------------ 검사 (저장 전 · 게임이 쓰기 전) → [{ level: error|warn, code, path, msg }]
  function validate(raw) {
    const out = [], add = (level, code, path, msg) => out.push({ level, code, path, msg });
    if (!isObj(raw)) { add('error', 'shape', '', '전투 설정이 객체가 아닙니다'); return out; }
    const P = normalize(raw);
    if (num(raw, 'version', 1) > 1) add('warn', 'version', 'version', `더 새 형식(version ${raw.version}) — 이 판이 모르는 칸은 무시합니다`);
    const rawA = objs(raw.attacks), rawB = objs(raw.behaviors);
    const seenA = new Set(), seenB = new Set();
    P.attacks.forEach((a, i) => {
      const r = rawA[i], p = `attacks.${i}`;
      if (!a.id) add('error', 'noId', p, `공격 ${i + 1}: id 가 없습니다`); else if (seenA.has(a.id)) add('error', 'dupId', p, `공격 id "${a.id}" 가 겹칩니다`); else seenA.add(a.id);
      for (const k of ['windup', 'recovery', 'cooldown', 'stun', 'statusTurns', 'hpCost', 'hits', 'range', 'radius', 'knockback']) if (num(r, k, 0) < 0) add('error', 'negative', `${p}.${k}`, `공격 "${a.name || a.id}": ${k} 가 음수입니다`);
      if (r.type != null && !TYPES.includes(r.type)) add('warn', 'attackType', `${p}.type`, `공격 "${a.name || a.id}": 모르는 종류 "${r.type}" — 근접으로`);
      if (r.status && !STATUS.includes(r.status)) add('warn', 'unsupported', `${p}.status`, `공격 "${a.name || a.id}": 런타임이 모르는 상태 "${r.status}" — 무시합니다`);
      if (num(r, 'crit', 0) > 100) add('warn', 'range', `${p}.crit`, `공격 "${a.name || a.id}": 치명 확률은 0~100`);
    });
    P.behaviors.forEach((b, i) => {
      const r = rawB[i], p = `behaviors.${i}`, nm = b.name || b.id || String(i + 1);
      if (!b.id) add('error', 'noId', p, `행동 ${i + 1}: id 가 없습니다`); else if (seenB.has(b.id)) add('error', 'dupId', p, `행동 id "${b.id}" 가 겹칩니다`); else seenB.add(b.id);
      for (const k of ['cooldown', 'delay', 'weight', 'chance', 'dist', 'amount']) if (num(r, k, 0) < 0) add('error', 'negative', `${p}.${k}`, `행동 "${nm}": ${k} 가 음수입니다`);
      if (num(r, 'chance', 100) > 100) add('warn', 'range', `${p}.chance`, `행동 "${nm}": 확률은 0~100`);
      if (r.action != null && !ACTIONS.includes(r.action)) add('error', 'action', `${p}.action`, `행동 "${nm}": 모르는 동작 "${r.action}"`);
      if (b.action === 'attack' && !b.attack) add('error', 'actionNoAttack', `${p}.attack`, `행동 "${nm}": 쓸 공격을 고르세요`);
      else if (b.action === 'attack' && !P.attacks.some(a => a.id === b.attack)) add('error', 'attackRef', `${p}.attack`, `행동 "${nm}": 없는 공격 "${b.attack}"`);
      if (b.action === 'attack' && b.target === 'self') add('warn', 'targetSelf', `${p}.target`, `행동 "${nm}": 자기 자신을 공격합니다`);
      if (b.next && !P.behaviors.some(x => x.id === b.next)) add('error', 'nextRef', `${p}.next`, `행동 "${nm}": 성공 뒤 행동 "${b.next}" 가 없습니다`);
      if (b.fail && !P.behaviors.some(x => x.id === b.fail)) add('error', 'failRef', `${p}.fail`, `행동 "${nm}": 실패 뒤 행동 "${b.fail}" 가 없습니다`);
      if (b.on === 'death' && !['attack', 'say', 'heal'].includes(b.action)) add('warn', 'deathAction', `${p}.action`, `행동 "${nm}": 쓰러질 때는 공격(범위) · 말하기만 합니다`);
      const walk = (c, cp) => {
        if (!isObj(c)) return;
        if (Array.isArray(c.items)) { if (!c.items.length) add('warn', 'emptyGroup', cp, `행동 "${nm}": 빈 조건 묶음 (항상 참)`); c.items.forEach((x, j) => walk(x, `${cp}.items.${j}`)); return; }
        if (!KEYS.includes(c.k)) add('error', 'condKey', cp, `행동 "${nm}": 모르는 조건 "${c.k}"`);
        if (c.cmp != null && !BOOL_KEYS.includes(c.k) && !STR_KEYS.includes(c.k) && !CMPS.includes(c.cmp)) add('error', 'condCmp', cp, `행동 "${nm}": 모르는 비교 "${c.cmp}"`);
        if (c.k === 'event' && !EVENTS.includes(c.v)) add('warn', 'condEvent', cp, `행동 "${nm}": 모르는 사건 "${c.v}"`);
        if (c.k === 'ready' && !P.attacks.some(a => a.id === c.v)) add('error', 'attackRef', cp, `행동 "${nm}": 조건의 공격 "${c.v}" 가 없습니다`);
      };
      walk(r.when, `${p}.when`);
    });
    // 이어지는 행동의 고리: 모두 대기 · 재사용 대기가 0 이면 같은 턴에 끝없이 이어질 수 있음
    const by = new Map(P.behaviors.map(b => [b.id, b])), hot = b => b.cooldown <= 0 && b.delay <= 0 && !(b.action === 'attack' && (P.attacks.find(a => a.id === b.attack) || {}).cooldown > 0);
    const reported = new Set();
    for (const b0 of P.behaviors) {
      for (const k of ['next', 'fail']) {
        const path = [b0.id]; let cur = by.get(b0[k]);
        while (cur && path.length <= P.behaviors.length) {
          if (cur.id === b0.id) {
            const key = [...path].sort().join('|');
            if (!reported.has(key) && path.every(id => hot(by.get(id)))) { reported.add(key); add(path.length === 1 ? 'error' : 'warn', path.length === 1 ? 'selfNext' : 'cycle', `behaviors.${P.behaviors.indexOf(b0)}.${k}`, `행동이 고리로 이어집니다 (${path.map(id => (by.get(id).name || id)).join(' → ')} → …) — 재사용 대기 · 대기가 모두 0 이라 끝없이 반복될 수 있습니다`); }
            break;
          }
          if (path.includes(cur.id)) break;
          path.push(cur.id); cur = by.get(cur.next) || by.get(cur.fail);
        }
      }
    }
    if (P.enabled && !P.behaviors.length) add('warn', 'noBehaviors', 'behaviors', '행동이 없습니다 — 게임은 원래 AI 로 움직입니다');
    return out;
  }
  const hasErrors = issues => issues.some(i => i.level === 'error');

  /** 이유 코드 → 사람이 읽는 문장 (시뮬레이터 · 디버그) */
  const WHY = { ok: '조건 통과', chain: '이어서 할 행동 — 바로 고름', disabled: '꺼져 있음', death: '쓰러질 때만', event: '그 사건이 없음', cooldown: '재사용 대기 중', noTarget: '대상 없음',
    cond: '조건 불만족', noAttack: '공격이 없음', attackCd: '공격 재사용 대기 중', range: '사거리 밖', line: '사이에 막힌 칸 (투사체가 닿지 않음)', cost: '체력이 모자람', chance: '확률에서 떨어짐', lower: '더 높은 우선순위 행동이 있음' };
  const REASON = { chosen: '가장 높은 우선순위', weighted: '같은 우선순위 중 가중치로', chain: '이어서 할 행동', none: '할 수 있는 행동이 없음 → 원래 AI', empty: '행동이 없음 → 원래 AI', disabled: '전투 설정이 꺼짐 → 원래 AI' };

  PDM.aiModel = { ACTIONS, TARGETS, TYPES, KEYS, CMPS, EVENTS, ONS, STATUS, FILTERS, NEEDS_TARGET, STR_KEYS, BOOL_KEYS, WHY, REASON,
    normalize, normAttack, normBehavior, normCond, normSit, evalCond, decide, after, turns, validate, hasErrors };
})();
