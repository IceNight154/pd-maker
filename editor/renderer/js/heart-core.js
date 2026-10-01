// ================================================================
//  마음 시스템 계산 (에디터 시뮬레이터용) — 게임의 HeartSystem.java 와 같은 계산식
//
//  한 캐릭터의 상태(rec):
//   { favor, trust, anger, sulk, displeased, mood, temper, stress, jealousy, fatigue, warm,
//     uses:{}, gauges:{}, crystals:{}, abl:{}, marks:{}, exp:{}, bonds:{}, memory:[] }
//
//  eraTW 에서 옮긴 규칙 (대사 제외, 시스템만)
//   · 호감도/신뢰도 상승 = 행동 기본값 + 능력/성격/기분 보정 + 자극의 "포화 곡선" 합 / 10   (TRACHECK_호감도·신뢰도상승처리)
//       포화 곡선: cap × v / (v + k)  — 큰 자극일수록 효과가 덜 늘어남 (era 의 (상한 - 계수/(SOURCE+c)))
//   · 무드(BASE:무드): 좋은 자극 × (친밀+1) / 3, 부드러운 상한(√) · 다른 캐릭터가 보고 있으면 절반 · 층마다 0
//   · 분노 = 행동 분노 × (2·무드최대 − 무드)/(2·무드최대 + 무드) × 기분 보정(좋음 0.7, 나쁨 1.5) × 성격
//       최대가 되면 삐짐(빡침) + 언짢음(층 수) + 기분 나쁨 (GET_ANGRY) — 사과 행동으로 풀림 (COMF303)
//   · 신뢰도: 무드가 가득이면 +2·하락 없음, 80% 이상이면 +1·하락 절반
//   · 호감도가 신뢰도×비율을 넘으면 상승량 = 상승 × 신뢰×K / (호감 + 신뢰×K)  (GET_REVISION, 이정표로 K 증가)
//   · 기분(TALENT:기분 −1/0/+1): 층마다 확률로 바뀜 (KIGEN_CHANGE), 호감·신뢰 ± 기분
//   · 행동 결과: 성공률·대성공률 → 대성공 자극×2 / 실패 자극×0.1·호감 없음·신뢰 하락 가능
//   · 대화 피로(회화 누적치): 한 층에서 많이 하면 실패 / 층당 횟수 제한(스킨십일시 같은 쿨다운)
//   · 질투(파루파루 규칙): 다른 캐릭터의 무드를 올리면 곁에서 보던 이정표 캐릭터가 분노
//   · 마음 열림(합의판정): 호감·신뢰 단계 + 이정표 + 능력 + 무드 + 흔적 → 부탁을 들어줄지 (ATTITUDE / REJECT_CHECK)
//   · 스트레스(eraTHYM CFLAG:65): 층마다 두려움·슬픔으로 쌓이고, 높으면 좋은 자극이 덜 들어옴
// ================================================================
PDM.Heart = (function () {
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

  /** 예전 heart.json 에 없던 규칙의 기본값 */
  const RULE_DEFAULTS = {
    maxValue: 10000, trustRatio: 4, capStart: 500, trustK: 20, bondTrustK: { 'bond.admire': 30, 'bond.close': 30, 'bond.partner': 40 },
    angerMax: 1000, angerDecay: 20, decayTurns: 10, angerFloorKeep: 0.5,
    moodMax: 500, moodSoft: [50, 100, 200], moodPerAction: 200, crowdHalf: true,
    temperChance: 10, displeasedFloors: 1, resentLock: 3, sulkMark: 0,
    fatigueMax: 300, curveK: 200, curveCap: 50,
    stressTiers: [100, 250, 500, 1000, 3000], stressMul: [1, 0.9, 0.85, 0.8, 0.7, 0.6],
    stressFrom: { 'gauge.fear': 0.2, 'gauge.sorrow': 0.2, 'gauge.tension': 0.05 }, stressRecover: 30, stressRecoverSafe: 200,
    jealousy: true, jealousyFavor: 500, jealousyDiv: { 'bond.partner': 3, 'bond.close': 5, 'bond.admire': 5, favor: 8 },
    gaugeReset: 'floor'
  };
  /** 감정 게이지의 좋고 나쁨 (+1 좋은 자극, −1 나쁜 자극, 0 중립) */
  const VALENCE = { 'gauge.joy': 1, 'gauge.relief': 1, 'gauge.respect': 1, 'gauge.shy': 0, 'gauge.tension': 0, 'gauge.fear': -1, 'gauge.anger': -1, 'gauge.sorrow': -1 };
  const ACCEPT_DEFAULTS = {
    favor: [[0, 0], [100, 30], [300, 50], [800, 75], [1500, 100], [3000, 150], [6000, 200]],
    trust: [[0, -30], [30, -10], [100, 0], [300, 30], [500, 50], [1000, 100]],
    bonds: { 'bond.admire': 30, 'bond.close': 60, 'bond.partner': 100 },
    abl: { 'abl.intimacy': 10 }, moodDiv: 5, marks: { 'mark.joy': 20, 'mark.awe': 10, 'mark.resent': -30, 'mark.fear': -20, 'mark.hurt': -10 },
    levels: [100, 250, 450]
  };

  /** 마음의 결정 (era JUEL). 예전 이름 gem.<광물> → crystal.<감정> */
  const GEM_TO_CRYSTAL = { 'gem.sunstone': 'crystal.joy', 'gem.emerald': 'crystal.relief', 'gem.enstatite': 'crystal.tension', 'gem.obsidian': 'crystal.fear',
    'gem.ruby': 'crystal.anger', 'gem.amethyst': 'crystal.shy', 'gem.lapis': 'crystal.respect', 'gem.aquamarine': 'crystal.sorrow',
    'gem.morganite': 'crystal.joy', 'gem.goshenite': 'crystal.joy', 'gem.heliodor': 'crystal.joy', 'gem.diamond': 'crystal.respect' };
  function crystalKey(k) { if (!k) return ''; if (k.startsWith('crystal.')) return k; return GEM_TO_CRYSTAL[k] || (k.startsWith('gem.') ? 'crystal.' + k.slice(4) : k); }
  /** 예전 heart.json (gems, gauge.gem, ability.gem) → 결정. 바뀌었으면 true */
  function migrate(sys) {
    if (!sys) return false; let ch = false;
    if (sys.gems) {
      const set = []; (sys.gauges || []).forEach(g => { const c = g.crystal || crystalKey(g.gem) || 'crystal.' + g.key.replace(/^gauge\./, ''); if (!set.includes(c)) set.push(c); });
      sys.gems.map(crystalKey).forEach(c => { if (!set.includes(c) && !Object.values(GEM_TO_CRYSTAL).includes(c)) set.push(c); });
      sys.crystals = sys.crystals || set; delete sys.gems; ch = true;
    }
    (sys.gauges || []).forEach(g => { if (g.gem !== undefined) { g.crystal = g.crystal || crystalKey(g.gem) || 'crystal.' + g.key.replace(/^gauge\./, ''); delete g.gem; ch = true; } });
    (sys.abilities || []).forEach(a => {
      if (a.gem !== undefined) { a.crystal = a.crystal || crystalKey(a.gem); delete a.gem; ch = true; }
      if (a.alt && a.alt.startsWith('gem.')) { a.alt = crystalKey(a.alt); ch = true; }
      if (a.alt === a.crystal) { a.alt = ''; ch = true; }
    });
    return ch;
  }

  function rules(sys) { return Object.assign({}, RULE_DEFAULTS, sys.rules || {}); }
  function acceptCfg(sys) { return Object.assign({}, ACCEPT_DEFAULTS, sys.acceptance || {}); }
  const valence = (sys, g) => { const d = (sys.gauges || []).find(x => x.key === g); return d && d.valence !== undefined ? d.valence : (VALENCE[g] || 0); };

  function newRecord(char) {
    const init = (char && char.heart && char.heart.initial) || {};
    return { favor: init.favor || 0, trust: init.trust || 0, anger: 0, sulk: false, displeased: 0, mood: 0, temper: 0, stress: 0, jealousy: 0,
      fatigue: 0, warm: false, uses: {}, gauges: {}, crystals: {}, abl: {}, marks: {}, exp: {}, bonds: {}, memory: [] };
  }
  function stage(sys, rec) {
    let s = 0;
    (sys.stages || []).forEach((st, i) => { if (rec.favor >= st.favor && rec.trust >= st.trust) s = i; });
    return s;
  }
  function traitsOf(sys, char) {
    const keys = (char && char.heart && char.heart.traits) || [];
    return (sys.traits || []).filter(t => keys.includes(t.key));
  }
  const tier = (table, v) => { let p = 0; (table || []).forEach(([th, pts]) => { if (v >= th) p = pts; }); return p; };

  /** 마음 열림(합의판정) 점수 — 부탁을 들어줄지, 태도 단계 */
  function acceptance(sys, rec) {
    const A = acceptCfg(sys);
    let s = tier(A.favor, rec.favor) + tier(A.trust, rec.trust);
    Object.entries(A.bonds || {}).forEach(([b, p]) => { if (rec.bonds[b]) s += p; });
    Object.entries(A.abl || {}).forEach(([k, p]) => { s += Math.min(rec.abl[k] || 0, 20) * p; });
    Object.entries(A.marks || {}).forEach(([k, p]) => { s += (rec.marks[k] || 0) * p; });
    s += Math.floor(rec.mood / Math.max(1, A.moodDiv || 5));
    s += rec.temper * 20;
    return s;
  }
  function acceptLevel(sys, rec) {
    if (rec.sulk || rec.displeased > 0) return 0;
    const s = acceptance(sys, rec); let lv = 0;
    (acceptCfg(sys).levels || []).forEach((th, i) => { if (s >= th) lv = i + 1; });
    return lv;
  }
  function stressTier(sys, rec) { const R = rules(sys); let t = 0; R.stressTiers.forEach((th, i) => { if (rec.stress >= th) t = i + 1; }); return t; }

  /** 조건식에서 쓰는 이름 → 값 */
  function resolver(sys, rec, extra) {
    return name => {
      if (extra && name in extra) return extra[name];
      switch (name) {
        case 'favor': return rec.favor; case 'trust': return rec.trust; case 'anger': return rec.anger;
        case 'sulk': return rec.sulk; case 'mood': return rec.mood; case 'stage': return stage(sys, rec);
        case 'temper': return rec.temper; case 'displeased': return rec.displeased > 0; case 'stress': return rec.stress;
        case 'jealousy': return rec.jealousy; case 'fatigue': return rec.fatigue; case 'warm': return rec.warm;
        case 'accept': return acceptance(sys, rec); case 'acceptLv': return acceptLevel(sys, rec);
        case 'moodFull': return rec.mood >= rules(sys).moodMax;
      }
      if (name.startsWith('gauge.')) return rec.gauges[name] || 0;
      if (name.startsWith('crystal.')) return rec.crystals[name] || 0;
      if (name.startsWith('gem.')) return rec.crystals[crystalKey(name)] || 0;   // 예전 이름(마음의 보석)
      if (name.startsWith('abl.')) return rec.abl[name] || 0;
      if (name.startsWith('mark.')) return rec.marks[name] || 0;
      if (name.startsWith('exp.')) return rec.exp[name] || 0;
      if (name.startsWith('bond.')) return !!rec.bonds[name];
      if (name.startsWith('att.')) return attitude(sys, rec) === name;
      if (name.startsWith('memory.')) return rec.memory.includes(name.slice(7));
      if (name.startsWith('uses.')) return rec.uses[name.slice(5)] || 0;
      return undefined;
    };
  }

  /** era GET_REVISION3: 기준을 넘는 부분은 √×2 로 부드럽게 */
  function soft(v, ths) { for (const th of ths || []) { if (v <= th || !th) return v; v = th + Math.sqrt(v - th) * 2; } return v; }

  /**
   * 행동 적용.
   *  ctx: { roll: 0~99 (없으면 무작위), crowd: 다른 캐릭터가 보고 있음, onlookers: [{rec, traits}] (질투 계산용) }
   *  돌려줌: { fav, tru, anger, mood, outcome: 'great'|'ok'|'fail'|'tired'|'limit'|'blocked', capped, gotSulk, calmed, stageUp, gained, jealous:[] }
   */
  function applyAction(sys, rec, action, traits, ctx) {
    ctx = ctx || {};
    const R = rules(sys);
    const res = { fav: 0, tru: 0, anger: 0, mood: 0, outcome: 'ok', capped: false, gotSulk: false, calmed: false, stageUp: false, gained: {}, jealous: [] };
    const has = t => traits.some(x => x[t]);
    const bondTop = key => key ? !!rec.bonds[key] : stage(sys, rec) >= (sys.stages || []).length - 1;
    // 사과처럼 삐졌을 때만 뜻이 있는 행동
    if (action.calm && !rec.sulk && !rec.displeased) { res.outcome = 'blocked'; return res; }
    // 결과 판정 (성공률은 마음 열림 점수로 보정)
    const roll = ctx.roll !== undefined ? ctx.roll : Math.floor(Math.random() * 100);
    const base = action.success === undefined ? 100 : action.success;
    const rate = base >= 100 ? 100 : clampN(base + clampN(Math.floor((acceptance(sys, rec) - 100) / 20), -20, 20) + (rec.abl['abl.talk'] || 0), 1, 99);
    if (roll < (action.great || 0)) res.outcome = 'great';
    else if (roll >= rate) res.outcome = 'fail';
    // 대화 피로 (회화 누적치) · 층당 횟수
    const tiredOk = rec.bonds['bond.partner'];
    if (action.fatigue && rec.fatigue >= R.fatigueMax && !tiredOk) res.outcome = 'tired';
    const used = rec.uses[action.key] || 0;
    const limited = action.perFloor > 0 && used >= action.perFloor;
    if (limited && res.outcome !== 'tired') res.outcome = 'limit';
    rec.uses[action.key] = used + 1;
    if (action.fatigue) rec.fatigue += Math.round(action.fatigue * 4 / (4 + (rec.abl['abl.talk'] || 0)));
    const fail = res.outcome === 'fail' || res.outcome === 'tired';
    const dead = limited || res.outcome === 'tired';
    rec.warm = true;

    // 자극 → 게이지 (성격 배율 · 친밀 · 스트레스 · 결과)
    const outMul = res.outcome === 'great' ? 2 : fail ? 0.1 : dead ? 0 : 1;
    const sMul = R.stressMul[stressTier(sys, rec)] || 1;
    let curve = 0, good = 0;
    Object.entries(action.source || {}).forEach(([g, v]) => {
      let mul = outMul;
      traits.forEach(t => { if (t.gaugeMul && t.gaugeMul[g]) mul *= t.gaugeMul[g]; });
      if (g === 'gauge.joy') mul *= 1 + 0.05 * (rec.abl['abl.intimacy'] || 0);
      const val = valence(sys, g);
      if (val > 0) mul *= sMul;
      const add = Math.round(v * mul);
      if (!add) return;
      rec.gauges[g] = (rec.gauges[g] || 0) + add; res.gained[g] = add;
      const d = (sys.gauges || []).find(x => x.key === g) || {};
      const k = d.k || R.curveK, cap = d.cap || R.curveCap;
      const c = val * cap * Math.abs(add) / (Math.abs(add) + k);
      curve += c; if (c > 0) good += c;
    });

    // 호감도
    let fav = action.favor || 0, tru = action.trust || 0;
    const positive = fav > 0;
    if (positive) fav += Math.floor(((rec.abl['abl.intimacy'] || 0) + (rec.abl['abl.deference'] || 0)) / 2) + rec.temper;
    let halve = false, halveKey = '';
    traits.forEach(t => {
      if (!(t.onlyPositive && fav <= 0)) fav += t.favorAdd || 0;
      if (!(t.onlyPositive && tru <= 0)) tru += t.trustAdd || 0;
      if (t.halve) { halve = true; halveKey = t.halveUnless || ''; }
    });
    fav += Math.trunc(curve / 10);
    if (positive) { fav -= rec.marks['mark.resent'] || 0; fav = Math.max(fav, -(rec.marks['mark.resent'] || 0)); }
    if (halve && !bondTop(halveKey)) { if (fav > 1) fav = Math.floor(fav / 2); else if (fav > 0) fav = 1; }
    if ((rec.sulk || rec.displeased) && fav > 0) fav = 0;
    if (fail || dead) fav = Math.min(0, fav);
    if (res.outcome === 'great' && fav > 0) fav = Math.floor(fav * 3 / 2);
    if (fav > 0 && rec.favor > R.capStart && rec.favor > rec.trust * R.trustRatio) {
      let K = R.trustK; Object.entries(R.bondTrustK || {}).forEach(([b, k]) => { if (rec.bonds[b]) K = Math.max(K, k); });
      const ref = rec.trust * K;
      fav = Math.floor(fav * ref / Math.max(1, rec.favor + ref)); res.capped = true;
    }

    // 신뢰도 (성공이면 내려가지 않고, 실패/하락 가능 행동일 때만 내려감)
    if (tru > 0 || positive) tru += Math.floor((rec.abl['abl.intimacy'] || 0) / 5) + rec.temper + Math.trunc(curve / 10);
    if (res.outcome === 'great') tru += 1;
    if (fail && rec.anger > 0) tru -= Math.floor(rec.anger / 100);
    if (rec.mood >= R.moodMax) { tru += 2; if (tru < 0) tru = 0; }
    else if (rec.mood >= R.moodMax * 4 / 5) { tru += 1; if (tru < 0) tru += Math.floor(Math.abs(tru) / 2); }
    if (halve && !bondTop(halveKey)) { if (tru > 1) tru = Math.floor(tru / 2); }
    if (tru < 0 && !action.canLowerTrust && !fail) tru = 0;
    if (fail && tru > 0) tru = 0;
    if (dead && tru > 0) tru = 0;

    // 무드 (좋은 자극 × 친밀) — 다른 캐릭터가 보고 있으면 절반
    let mood = 0;
    if (good > 0 && !dead) {
      mood = Math.min((rec.abl['abl.intimacy'] || 0) + 1, 10) * good / 3;
      mood = soft(mood, R.moodSoft);
      if (ctx.crowd && R.crowdHalf) mood /= 2;
      mood = Math.min(Math.round(mood), R.moodPerAction);
    }

    // 분노 — 무드가 높으면 덜, 기분·성격 보정
    let anger = action.anger || 0;
    if (anger > 0) {
      anger = anger * (2 * R.moodMax - rec.mood) / (2 * R.moodMax + rec.mood);
      anger *= rec.temper > 0 ? 0.7 : rec.temper < 0 ? 1.5 : 1;
      traits.forEach(t => { if (t.angerMul) anger *= t.angerMul; });
      anger = Math.round(anger);
    }

    // 적용
    const before = stage(sys, rec);
    rec.favor = clampN(rec.favor + fav, -R.maxValue, R.maxValue);
    rec.trust = clampN(rec.trust + tru, 0, R.maxValue);
    rec.mood = clampN(rec.mood + mood, 0, R.moodMax);
    rec.anger = clampN(rec.anger + anger, 0, R.angerMax);
    if (anger < 0 && rec.anger === 0 && !rec.displeased) rec.sulk = false;
    // 사과: 성공 → 삐짐·언짢음 해제, 분노 절반 (대성공이면 0)
    if (action.calm && !fail) {
      rec.sulk = false; rec.displeased = 0;
      rec.anger = res.outcome === 'great' ? 0 : Math.floor(rec.anger / 2);
      if (action.removeResent && rec.marks['mark.resent']) rec.marks['mark.resent'] = Math.max(0, rec.marks['mark.resent'] - action.removeResent);
      res.calmed = true;
    }
    if (rec.anger >= R.angerMax && !rec.sulk) getAngry(sys, rec, res);
    if (action.exp) rec.exp[action.exp] = (rec.exp[action.exp] || 0) + 1;
    // 질투: 이 캐릭터의 무드를 올리는 걸 본 다른 캐릭터
    if (mood > 0 && R.jealousy) (ctx.onlookers || []).forEach(o => {
      const orc = o.rec, J = R.jealousyDiv || {};
      let div = 0;
      ['bond.partner', 'bond.close', 'bond.admire'].forEach(b => { if (!div && orc.bonds[b] && J[b]) div = J[b]; });
      if (!div && orc.favor >= R.jealousyFavor && J.favor) div = J.favor;
      let mul = 1; (o.traits || []).forEach(t => { if (t.jealousMul !== undefined) mul *= t.jealousMul; });
      if (!div || !mul) return;
      const a = Math.round(Math.min((orc.abl['abl.intimacy'] || 0) + 1, 10) * good / div * mul);
      if (a <= 0) return;
      orc.anger = clampN(orc.anger + a, 0, R.angerMax); orc.jealousy += a;
      const r2 = { gotSulk: false }; if (orc.anger >= R.angerMax && !orc.sulk) getAngry(sys, orc, r2);
      res.jealous.push({ id: o.id, anger: a, sulk: r2.gotSulk });
    });
    Object.assign(res, { fav, tru, anger, mood, stageUp: stage(sys, rec) > before });
    return res;
  }

  /** 분노가 최대 → 삐짐 (era GET_ANGRY: 빡침 + 언짢음 + 기분 나쁨 + 반발 흔적) */
  function getAngry(sys, rec, res) {
    const R = rules(sys);
    rec.sulk = true; rec.anger = R.angerMax; rec.displeased = Math.max(rec.displeased, R.displeasedFloors); rec.temper = -1;
    if (R.sulkMark) rec.marks['mark.resent'] = Math.min(3, (rec.marks['mark.resent'] || 0) + R.sulkMark);
    if (res) res.gotSulk = true;
  }

  /** 시간 경과: 분노가 풀림 (언짢음 동안은 안 풀림) */
  function decay(sys, rec) {
    if (rec.displeased > 0) return;
    rec.anger = Math.max(0, rec.anger - rules(sys).angerDecay);
    if (rec.sulk && rec.anger === 0) rec.sulk = false;
  }

  /** 새 층 도착: 무드·피로·횟수 초기화, 기분 변화, 언짢음 1 감소 (era AFTERTRA / EVENTTURNEND / BEFORETRAIN)
   *  rnd: () => 0~1 (없으면 Math.random), traits: 성격, safe: 던전 밖(쉬는 곳) */
  function newFloor(sys, rec, traits, rnd, safe) {
    const R = rules(sys); rnd = rnd || Math.random;
    rec.mood = 0; rec.fatigue = 0; rec.uses = {}; rec.warm = false;
    if (rec.displeased > 0) {
      rec.displeased--;
      if (!rec.displeased && (rec.marks['mark.resent'] || 0) >= R.resentLock) rec.displeased = 1;
    }
    if (rec.displeased > 0) { rec.anger = R.angerMax; rec.sulk = true; }
    else { rec.anger = Math.floor(rec.anger * R.angerFloorKeep); if (rec.sulk && rec.anger < R.angerMax) rec.sulk = false; }
    // 기분: 보통으로 돌아온 뒤 확률로 좋아지거나 나빠짐
    let chance = R.temperChance;
    (traits || []).forEach(t => { if (t.temperMul !== undefined) chance *= t.temperMul; });
    if (!rec.displeased) rec.temper = 0;
    if (rnd() * 100 < chance) rec.temper = clampN(rec.temper + (rnd() < 0.5 ? 1 : -1), -1, 1);
    rec.stress = Math.max(0, rec.stress - (safe ? R.stressRecoverSafe : R.stressRecover));
  }

  /** 층을 떠날 때: 게이지 → 결정, 흔적 판정, 스트레스, 게이지 초기화. 가장 큰 감정을 돌려줌(일기용) */
  function crystallize(sys, rec) {
    const R = rules(sys);
    const res = { crystals: {}, marks: [], strongest: null, stress: 0 };
    let best = 0;
    (sys.marks || []).forEach(m => {
      const v = rec.gauges[m.gauge] || 0;
      let lv = 0; (m.levels || []).forEach((th, i) => { if (v >= th) lv = i + 1; });
      if (lv > (rec.marks[m.key] || 0)) { rec.marks[m.key] = lv; res.marks.push({ key: m.key, level: lv }); }
    });
    Object.entries(R.stressFrom || {}).forEach(([g, f]) => { res.stress += Math.round((rec.gauges[g] || 0) * f); });
    rec.stress += res.stress;
    (sys.gauges || []).forEach(g => {
      const v = rec.gauges[g.key] || 0;
      if (v > best) { best = v; res.strongest = g.key; }
      const n = Math.floor(v / Math.max(1, g.rate || 100));
      const c = g.crystal || crystalKey(g.gem || '') || 'crystal.' + g.key.replace(/^gauge\./, '');
      if (n > 0) { rec.crystals[c] = (rec.crystals[c] || 0) + n; res.crystals[c] = (res.crystals[c] || 0) + n; }
    });
    rec.gauges = {};
    return res;
  }

  /** 부탁 판정 (era REJECT_CHECK: 합의판정 > 필요치) — { ok, score, need, reason } */
  function request(sys, rec, req) {
    const score = acceptance(sys, rec);
    let need = req.need || 0;
    if (req.moodNeed && rec.mood < rules(sys).moodMax * req.moodNeed) return { ok: false, score, need, reason: 'mood' };
    if (rec.sulk || rec.displeased) return { ok: false, score, need, reason: 'sulk' };
    if (req.when && !PDM.Cond.evaluate(req.when, resolver(sys, rec))) return { ok: false, score, need, reason: 'cond' };
    return { ok: score > need, score, need, reason: score > need ? '' : 'score' };
  }

  /** 능력 레벨업 비용 (현재 레벨 lv → lv+1) */
  function ablCost(ab, lv) { return Math.ceil((ab.base || 1) * Math.pow(ab.growth || 2, lv)); }
  function tryLevelUp(sys, rec, key) {
    const ab = (sys.abilities || []).find(a => a.key === key); if (!ab) return false;
    const lv = rec.abl[key] || 0; if (lv >= ab.max) return false;
    const cost = ablCost(ab, lv);
    const pay = [ab.crystal || crystalKey(ab.gem || ''), crystalKey(ab.alt || '')].filter(Boolean).find(g => (rec.crystals[g] || 0) >= cost);
    if (!pay) return false;
    rec.crystals[pay] -= cost; rec.abl[key] = lv + 1;
    return { key, level: lv + 1, paid: pay, cost };
  }

  function attitude(sys, rec) {
    const r = resolver(sys, rec, { __noAtt: true });
    const safe = n => (n.startsWith('att.') ? false : r(n));
    const a = (sys.attitudes || []).find(x => PDM.Cond.evaluate(x.when, safe));
    return a ? a.key : 'att.indifferent';
  }

  /** 새로 만족한 관계 이정표 (replaces: 아래 이정표를 대신함 — era 사모 → 연모) */
  function checkMilestones(sys, rec) {
    const got = [];
    (sys.milestones || []).forEach(m => {
      if (rec.bonds[m.key]) return;
      if (m.blockedBy && PDM.Cond.evaluate(m.blockedBy, resolver(sys, rec))) return;
      if (PDM.Cond.evaluate(m.when, resolver(sys, rec))) {
        rec.bonds[m.key] = true; got.push(m);
        if (m.replaces) delete rec.bonds[m.replaces];
      }
    });
    return got;
  }

  /** 대사 고르기 (era 구상 방식): 조건이 맞는 것 중 가장 구체적인 것, 같으면 무작위 */
  function pickLine(sys, rec, char, topic, extra) {
    const lines = ((char && char.dialogue) || {})[topic] || [];
    const r = resolver(sys, rec, extra);
    const ok = lines.filter(l => PDM.Cond.evaluate(l.when, r));
    if (!ok.length) return null;
    const best = Math.max(...ok.map(l => PDM.Cond.specificity(l.when)));
    const top = ok.filter(l => PDM.Cond.specificity(l.when) === best);
    return top[Math.floor(Math.random() * top.length)];
  }

  /** 행동 결과 → 말할 토픽 */
  function topicFor(action, res, rec) {
    if (res.outcome === 'blocked') return null;
    if (res.gotSulk) return 'sulk';
    if (res.calmed) return 'apology_ok';
    if (action.calm) return 'apology_fail';
    if (res.outcome === 'tired') return 'talk_tired';
    if (res.stageUp) return 'stage_up';
    const t = action.topic || { TALK: 'talk', GIFT_LIKED: 'gift_liked', GIFT_NORMAL: 'gift_normal', GIFT_DISLIKED: 'gift_disliked', ATTACKED: 'attacked', IGNORED: 'ignored' }[action.key];
    if (!t) return null;
    if ((rec.sulk || rec.displeased) && (action.favor || 0) > 0) return 'sulk';
    if (res.outcome === 'fail' && action.failTopic) return action.failTopic;
    return t;
  }

  return { GEM_TO_CRYSTAL, crystalKey, migrate, RULE_DEFAULTS, ACCEPT_DEFAULTS, rules, newRecord, stage, traitsOf, resolver, applyAction, getAngry, decay, newFloor, crystallize,
    acceptance, acceptLevel, request, stressTier, ablCost, tryLevelUp, attitude, checkMilestones, pickLine, topicFor, soft };
})();
