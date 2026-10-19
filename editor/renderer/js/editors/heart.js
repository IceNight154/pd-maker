// ================================================================
//  마음 시스템 편집기 (era 방식) + 시뮬레이터
//   행동 → 자극 → 감정 게이지 → (층을 떠날 때) 보석 → 관계 능력
//   호감도/신뢰도/분노 규칙, 성격, 흔적, 태도, 관계 이정표, 반응, 대사 토픽
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;
  const K = 'heart';

  // ---------------- 시뮬레이터 ----------------
  function simulator(charId) {
    const sys = store.get(K);
    const R = PDM.Heart.rules(sys);
    const chars = store.all('char').filter(c => c.heart && c.heart.enabled);
    const st = { char: chars.find(c => c.id === charId) || chars[0] || null, other: null, log: [], floor: 1 };
    let rec = PDM.Heart.newRecord(st.char), orec = null;
    const wrap = h('div', {});
    const bar = (label, v, max, color, txt) => h('div', { class: 'bar' }, h('span', {}, label), h('span', { class: 't' }, h('i', { style: { width: PDM.clamp(v / Math.max(1, max) * 100, 0, 100) + '%', background: color } })), h('b', {}, txt !== undefined ? txt : String(v)));
    const traits = c => c ? PDM.Heart.traitsOf(sys, c) : [];
    const say = (topic, c, r) => { c = c || st.char; r = r || rec; if (!c || !topic) return; const l = PDM.Heart.pickLine(sys, r, c, topic); if (l) st.log.unshift(`  ${c.name}: 「${l.text}」`); };
    const sign = n => (n >= 0 ? '+' : '') + n;
    const OUT = { great: '대성공', ok: '성공', fail: '실패', tired: '대화 피로 — 오늘은 그만', limit: '이번 층 횟수 초과(효과 없음)', blocked: '지금은 할 수 없음' };
    const tempName = t => PDM.T(t > 0 ? 'temper.good' : t < 0 ? 'temper.bad' : 'temper.normal');
    function draw() {
      wrap.innerHTML = '';
      const stg = PDM.Heart.stage(sys, rec), att = PDM.Heart.attitude(sys, rec), acc = PDM.Heart.acceptance(sys, rec), alv = PDM.Heart.acceptLevel(sys, rec);
      const sel = h('select', { onchange: () => { st.char = chars.find(c => c.id === sel.value) || null; rec = PDM.Heart.newRecord(st.char); st.log = []; draw(); } },
        chars.map(c => h('option', { value: c.id }, c.name)));
      if (st.char) sel.value = st.char.id;
      const osel = h('select', { onchange: () => { st.other = chars.find(c => c.id === osel.value) || null; orec = st.other ? PDM.Heart.newRecord(st.other) : null; draw(); } },
        h('option', { value: '' }, '(아무도 없음)'), chars.filter(c => !st.char || c.id !== st.char.id).map(c => h('option', { value: c.id }, c.name)));
      osel.value = st.other ? st.other.id : '';
      const maxF = Math.max(100, ((sys.stages || []).slice(-1)[0] || {}).favor * 1.2 || 100);
      const lvls = (PDM.Heart.ACCEPT_DEFAULTS.levels && (sys.acceptance || {}).levels) || PDM.Heart.ACCEPT_DEFAULTS.levels;
      wrap.append(
        h('div', { class: 'hstack gap-4 wrap mb-4' },
          '캐릭터', chars.length ? sel : h('span', { class: 'hint' }, '마음 시스템을 켠 캐릭터가 없습니다 (성격 없이 계산)'),
          '곁에서 보는 캐릭터', osel,
          h('span', { class: 'badge gold' }, (sys.stages[stg] || {}).name || ''), h('span', { class: 'badge' }, PDM.T(att)),
          h('span', { class: 'badge' }, PDM.T('rel.temper') + ' ' + tempName(rec.temper)),
          rec.sulk ? h('span', { class: 'badge bad' }, PDM.T('rel.sulk')) : null,
          rec.displeased ? h('span', { class: 'badge bad' }, PDM.T('rel.displeased') + ' ' + rec.displeased) : null,
          ...Object.keys(rec.bonds).map(b => h('span', { class: 'badge good' }, PDM.T(b))),
          h('span', { class: 'hint' }, `${st.floor}번째 층`)),
        bar(PDM.T('rel.favor'), rec.favor, maxF, 'var(--bad)'),
        bar(PDM.T('rel.trust'), rec.trust, Math.max(50, ((sys.stages || []).slice(-1)[0] || {}).trust * 1.2 || 50), 'var(--good)'),
        bar(PDM.T('rel.mood'), rec.mood, R.moodMax, '#ff9ecf', `${rec.mood}/${R.moodMax}`),
        bar(PDM.T('rel.anger'), rec.anger, R.angerMax, 'var(--gold)'),
        bar(PDM.T('rel.accept'), acc, lvls[lvls.length - 1] * 1.2, '#ff6b9a', `${acc}  ${'♥'.repeat(alv)}${'♡'.repeat(Math.max(0, lvls.length - alv))}`),
        bar(PDM.T('rel.fatigue'), rec.fatigue, R.fatigueMax, '#8aa0c8', `${rec.fatigue}/${R.fatigueMax}`),
        bar(PDM.T('rel.stress'), rec.stress, R.stressTiers[R.stressTiers.length - 1], '#7c6f9a', `${rec.stress} (${PDM.Heart.stressTier(sys, rec)}단계)`),
        orec ? bar(st.other.name + ' ' + PDM.T('rel.anger'), orec.anger, R.angerMax, 'var(--gold)', `${orec.anger}${orec.sulk ? ' ' + PDM.T('rel.sulk') : ''} · ${PDM.T('rel.jealousy')} ${orec.jealousy}`) : null,
        h('div', { class: 'cols2 mt-4' },
          h('div', {}, h('div', { class: 'fl' }, PDM.T('sys.gauge') + ' (이번 층)'), ...(sys.gauges || []).map(g => bar(PDM.T(g.key), rec.gauges[g.key] || 0, Math.max(500, ...Object.values(rec.gauges)), 'var(--accent)'))),
          h('div', {}, h('div', { class: 'fl' }, PDM.T('sys.crystal')),
            h('div', { class: 'kv' }, ...(sys.crystals || []).flatMap(g => rec.crystals[g] ? [h('b', {}, PDM.T(g)), h('span', {}, rec.crystals[g])] : [])),
            h('div', { class: 'fl mt-3' }, PDM.T('sys.ability')),
            h('div', { class: 'kv' }, ...(sys.abilities || []).flatMap(a => [h('b', {}, PDM.T(a.key)), h('span', {}, `Lv ${rec.abl[a.key] || 0}  (다음: ${PDM.T(a.crystal)} ${PDM.Heart.ablCost(a, rec.abl[a.key] || 0)})`)])),
            h('div', { class: 'fl mt-3' }, PDM.T('sys.mark')),
            h('div', { class: 'kv' }, ...(sys.marks || []).flatMap(m => rec.marks[m.key] ? [h('b', {}, PDM.T(m.key)), h('span', {}, '★'.repeat(rec.marks[m.key]))] : [])))),
        h('div', { class: 'fl mt-5' }, '행동'),
        h('div', { class: 'flex gap-2 wrap' },
          (sys.actions || []).map(a => h('button', { class: 'btn sm' + (a.favor < 0 || a.anger > 0 ? ' danger' : '') + (a.menu ? ' pri' : ''), title: a.menu ? '말 걸기 메뉴에 나오는 행동' : '', onclick: () => {
            const onlookers = orec ? [{ id: st.other.id, rec: orec, traits: traits(st.other) }] : [];
            const r = PDM.Heart.applyAction(sys, rec, a, traits(st.char), { crowd: !!orec, onlookers });
            if (r.outcome === 'blocked') { st.log.unshift(`${a.name}: ${OUT.blocked} (삐지지 않았음)`); draw(); return; }
            st.log.unshift(`${a.name} [${OUT[r.outcome]}]: ${PDM.T('rel.favor')} ${sign(r.fav)}, ${PDM.T('rel.trust')} ${sign(r.tru)}, ${PDM.T('rel.mood')} ${sign(r.mood)}${r.anger ? ', ' + PDM.T('rel.anger') + ' ' + sign(r.anger) : ''}${r.capped ? ' (신뢰 부족으로 호감 감소)' : ''}${r.calmed ? ' → 화가 풀림' : ''}${r.gotSulk ? ' → ' + PDM.T('rel.sulk') + '!' : ''}${r.stageUp ? ` → 「${sys.stages[PDM.Heart.stage(sys, rec)].name}」 달성!` : ''}`);
            r.jealous.forEach(j => { st.log.unshift(`  💢 ${st.other.name} 질투: ${PDM.T('rel.anger')} +${j.anger}${j.sulk ? ' → ' + PDM.T('rel.sulk') + '!' : ''}`); say('jealous', st.other, orec); });
            say(PDM.Heart.topicFor(a, r, rec));
            PDM.Heart.checkMilestones(sys, rec).forEach(m => st.log.unshift(`💞 이정표 「${PDM.T(m.key)}」 획득${m.event ? ' → 이벤트 ' + m.event : ''}${m.replaces ? ' (「' + PDM.T(m.replaces) + '」 대신)' : ''}`));
            draw();
          } }, a.name))),
        (sys.requests || []).length ? h('div', { class: 'fl mt-3' }, '부탁 (마음 열림 > 필요치)') : null,
        h('div', { class: 'flex gap-2 wrap' },
          (sys.requests || []).map(q => h('button', { class: 'btn sm', onclick: () => {
            const r = PDM.Heart.request(sys, rec, q);
            const why = { mood: `${PDM.T('rel.mood')} 부족`, sulk: PDM.T('rel.sulk'), cond: '조건 불만족', score: '점수 부족' }[r.reason] || '';
            st.log.unshift(`≫ ${q.name}: ${r.ok ? '들어줌 ♥' : '거절 — ' + why} (${PDM.T('rel.accept')} ${r.score} / 필요 ${r.need})`);
            const act = (sys.actions || []).find(a => a.key === (r.ok ? q.okAction : q.noAction));
            if (act) { const ar = PDM.Heart.applyAction(sys, rec, act, traits(st.char), { roll: 0 }); st.log.unshift(`  → ${act.name}: ${PDM.T('rel.favor')} ${sign(ar.fav)}, ${PDM.T('rel.trust')} ${sign(ar.tru)}${ar.anger ? ', ' + PDM.T('rel.anger') + ' ' + sign(ar.anger) : ''}`); }
            say(r.ok ? 'request_ok' : 'request_no');
            draw();
          } }, `${q.name} (${q.need})`))),
        h('div', { class: 'fl mt-3' }, '시간'),
        h('div', { class: 'flex gap-2 wrap' },
          h('button', { class: 'btn sm', onclick: () => { PDM.Heart.decay(sys, rec); if (orec) PDM.Heart.decay(sys, orec); st.log.unshift(`${R.decayTurns}턴 경과: ${PDM.T('rel.anger')} -${rec.displeased ? 0 : R.angerDecay}${rec.displeased ? ' (' + PDM.T('rel.displeased') + ' — 안 풀림)' : ''}`); draw(); } }, `${R.decayTurns}턴 지나기`),
          h('button', { class: 'btn sm pri', onclick: () => {
            say('diary');   // 일기는 게이지가 남아 있을 때 고름 (조건에 gauge.* 사용 가능)
            const r = PDM.Heart.crystallize(sys, rec); if (orec) PDM.Heart.crystallize(sys, orec);
            st.log.unshift(`층을 떠남 → ${PDM.T('sys.crystal')}: ${Object.entries(r.crystals).map(([g, n]) => PDM.T(g) + '×' + n).join(', ') || '없음'}${r.marks.length ? ' / ' + r.marks.map(m => PDM.T(m.key) + ' ' + m.level + '단계').join(', ') : ''}${r.stress ? ' / ' + PDM.T('rel.stress') + ' +' + r.stress : ''}${r.strongest ? ' / 일기: 가장 큰 감정 ' + PDM.T(r.strongest) : ''}`);
            st.floor++;
            PDM.Heart.newFloor(sys, rec, traits(st.char)); if (orec) PDM.Heart.newFloor(sys, orec, traits(st.other));
            st.log.unshift(`새 층 도착: ${PDM.T('rel.mood')}·${PDM.T('rel.fatigue')} 0, ${PDM.T('rel.temper')} ${tempName(rec.temper)}${rec.displeased ? ', ' + PDM.T('rel.displeased') + ' ' + rec.displeased : ''}${rec.sulk ? ', 아직 ' + PDM.T('rel.sulk') : ''}`);
            draw();
          } }, '층 떠나기 → 새 층 (결정화)'),
          h('button', { class: 'btn sm', onclick: () => { PDM.Heart.newFloor(sys, rec, traits(st.char), null, true); st.log.unshift(`던전 밖(쉬는 곳)에서 쉼: ${PDM.T('rel.stress')} -${R.stressRecoverSafe}`); draw(); } }, '쉬는 곳에서 쉬기'),
          (sys.abilities || []).map(a => h('button', { class: 'btn sm', onclick: () => { const r = PDM.Heart.tryLevelUp(sys, rec, a.key); st.log.unshift(r ? `${PDM.T(a.key)} Lv ${r.level} (${PDM.T(r.paid)} ${r.cost}개 사용)` : `${PDM.T(a.key)}: ${PDM.T('sys.crystal')}이 부족합니다`); PDM.Heart.checkMilestones(sys, rec).forEach(m => st.log.unshift(`💞 이정표 「${PDM.T(m.key)}」 획득`)); draw(); } }, `${PDM.T(a.key)} ↑`)),
          h('button', { class: 'btn sm', onclick: () => { rec = PDM.Heart.newRecord(st.char); orec = st.other ? PDM.Heart.newRecord(st.other) : null; st.log = []; st.floor = 1; draw(); } }, '처음부터')),
        h('div', { class: 'sim-log' }, st.log.slice(0, 60).map(l => h('div', {}, l))));
    }
    draw();
    return wrap;
  }
  PDM.heartSim = charId => PDM.ui.modal(PDM.T('sys.heart') + ' 시뮬레이터', h('div', { style: { width: '820px' } }, simulator(charId)), [['닫기', null]]);

  // ---------------- 편집기 ----------------
  PDM.registerEditor({
    id: 'heart', icon: '💗', title: () => PDM.T('sys.heart'),
    match: k => k === 'heart',
    watch: ck => ck === 'heart' || ck === 'terms',
    tree: () => store.isOpen ? [{ id: 'sys', label: '시스템', icon: '⚙', order: 60, children: [
      { id: 'heart', label: PDM.T('sys.heart') + ' (era)', icon: '💗', open: 'heart' },
      { id: 'terms', label: '용어 관리', icon: '🔤', open: 'terms' },
      { id: 'plugins', label: '플러그인', icon: '🧩', open: 'plugins' },
      { id: 'legacy', label: 'Java 코드 생성기 (이전 메이커)', icon: '☕', open: 'legacy' }] }] : [],
    render(key) {
      const sys = store.get(K);
      const { F, section, row, listEditor } = PDM.ui;
      const gaugeKeys = (sys.gauges || []).map(g => g.key);
      const gemOpts = (sys.crystals || []).map(g => [g, PDM.T(g)]);
      const gaugeOpts = gaugeKeys.map(g => [g, PDM.T(g)]);
      /** [[기준, 점수], …] 표 */
      const tableEditor = path => {
        const cur = PDM.deepGet(sys, path);
        if (!cur) return h('button', { class: 'btn sm', onclick: () => store.edit(key, '표 만들기', o => { PDM.deepSet(o, path, PDM.clone(PDM.deepGet({ acceptance: PDM.Heart.ACCEPT_DEFAULTS }, path))); }) }, '기본 표로 시작 (지금은 기본값 사용 중)');
        return listEditor(key, path, { addLabel: '줄 추가', compact: true, dup: false, make: () => [0, 0],
          render: (it, i, p) => row(F.num(key, [...p, 0], { label: '이상', int: true }), F.num(key, [...p, 1], { label: '점수', int: true })) });
      };
      /** 예전 프로젝트에 없는 기본 항목만 추가 */
      const importDefaults = () => store.edit(key, '새 규칙 가져오기', o => {
        const d = PDM.defaults.heart(); let n = 0;
        o.rules = o.rules || {};
        Object.entries(d.rules).forEach(([k, v]) => { if (o.rules[k] === undefined) { o.rules[k] = PDM.clone(v); n++; } });
        if (!o.acceptance) { o.acceptance = PDM.clone(d.acceptance); n++; }
        ['actions', 'traits', 'requests', 'topics', 'counters'].forEach(list => {
          o[list] = o[list] || [];
          const keyOf = x => x.key || (x.trigger + '|' + x.when + '|' + x.topic);
          d[list].forEach(x => { if (!o[list].some(y => keyOf(y) === keyOf(x))) { o[list].push(PDM.clone(x)); n++; } });
        });
        (o.gauges || []).forEach(g => { const dg = d.gauges.find(x => x.key === g.key); if (dg && g.valence === undefined) { g.valence = dg.valence; n++; } });
        (o.milestones || []).forEach(m => { if (m.blockedBy === undefined) { const dm = d.milestones.find(x => x.key === m.key); m.blockedBy = dm ? dm.blockedBy : ''; m.replaces = ''; n++; } });
        setTimeout(() => toast(n ? `${n}개 항목을 추가했습니다` : '추가할 항목이 없습니다'), 0);
      });
      const vec = (p, label) => h('div', { class: 'field' }, h('span', { class: 'fl' }, label),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' } },
          gaugeKeys.map(g => h('label', { class: 'hstack gap-2 fs-xs' }, h('span', { style: { width: '42px', color: 'var(--mute)' } }, PDM.T(g)), F.num(key, [...p, g], { step: p.includes('gaugeMul') ? 0.1 : 10 })))));
      return h('div', { class: 'page' },
        h('h1', {}, PDM.T('sys.heart')),
        h('p', { class: 'lead' }, 'era(eraTW) 의 SOURCE→PALAM→JUEL→ABL 흐름과 호감·신뢰·무드·분노 처리를 옮긴 관계 시스템입니다. ',
          h('b', {}, '행동'), ' → ', h('b', {}, PDM.T('sys.source')), ' → ', h('b', {}, PDM.T('sys.gauge')), ' → (층을 떠날 때) ', h('b', {}, PDM.T('sys.crystal')), ' → ', h('b', {}, PDM.T('sys.ability')),
          '. 모든 이름은 도구 → 용어 관리에서 바꿀 수 있습니다.'),
        section('시뮬레이터', simulator()),
        section('소리', h('p', { class: 'hint' }, '마음 시스템에서 나는 소리입니다. 비워 두면 기본 소리, 🎚 로 사운드 편집기에서 편집합니다.'),
          PDM.ui.row(PDM.ui.F.sysSound(key, ['sounds', 'up'], 'heart.up', { label: '호감이 오를 때' }), PDM.ui.F.sysSound(key, ['sounds', 'down'], 'heart.down', { label: '호감이 내릴 때' }),
            PDM.ui.F.sysSound(key, ['sounds', 'bond'], 'heart.bond', { label: '이정표를 얻을 때' }), PDM.ui.F.sysSound(key, ['sounds', 'crystal'], 'heart.crystal', { label: PDM.T('sys.crystal') + '이 생길 때' }))),
        section('기본 규칙 (era 호감도·신뢰도 처리)',
          h('div', { class: 'hstack mb-3' },
            h('button', { class: 'btn sm', onclick: () => importDefaults() }, '새 규칙·행동·토픽 가져오기'),
            h('span', { class: 'hint' }, '예전에 만든 프로젝트에 없는 기본 항목(무드·부탁·사과 행동·새 성격·토픽 등)만 추가합니다. 이미 있는 건 그대로 둡니다.')),
          row(F.num(key, ['rules', 'maxValue'], { label: '최대치', int: true }), F.num(key, ['rules', 'trustRatio'], { label: '신뢰도 비율', hint: '호감도 > 신뢰도×이 값이면 상승 감소', min: 1 }), F.num(key, ['rules', 'capStart'], { label: '감소 시작 호감도', int: true }),
            F.num(key, ['rules', 'trustK'], { label: '감소 곡선 K', int: true, def: 20, hint: '상승 × 신뢰×K / (호감 + 신뢰×K)' })),
          row(...['bond.admire', 'bond.close', 'bond.partner'].map(b => F.num(key, ['rules', 'bondTrustK', b], { label: PDM.T(b) + ' 일 때 K', int: true, def: PDM.Heart.RULE_DEFAULTS.bondTrustK[b] }))),
          h('div', { class: 'fl mt-4' }, PDM.T('rel.anger') + ' · ' + PDM.T('rel.sulk') + ' · ' + PDM.T('rel.displeased') + ' (era GET_ANGRY)'),
          row(F.num(key, ['rules', 'angerMax'], { label: PDM.T('rel.anger') + ' 최대 (' + PDM.T('rel.sulk') + ')', int: true }), F.num(key, ['rules', 'angerDecay'], { label: '감소량', int: true }), F.num(key, ['rules', 'decayTurns'], { label: '감소 간격(턴)', int: true }),
            F.num(key, ['rules', 'angerFloorKeep'], { label: '새 층에서 남는 비율', step: 0.1, min: 0, max: 1, def: 0.5 })),
          row(F.num(key, ['rules', 'displeasedFloors'], { label: PDM.T('rel.displeased') + ' 층 수', int: true, min: 0, def: 1, hint: '삐지면 이만큼의 층 동안 분노가 안 풀림' }),
            F.num(key, ['rules', 'resentLock'], { label: '풀리지 않는 반발 단계', int: true, min: 1, max: 4, def: 3, hint: PDM.T('mark.resent') + '이 이 단계면 ' + PDM.T('rel.displeased') + '이 계속됨' }),
            F.num(key, ['rules', 'sulkMark'], { label: '삐질 때 ' + PDM.T('mark.resent') + ' +', int: true, min: 0, max: 3, def: 0 })),
          h('div', { class: 'fl mt-4' }, PDM.T('rel.mood') + ' · ' + PDM.T('rel.temper') + ' (era BASE:무드, TALENT:기분)'),
          row(F.num(key, ['rules', 'moodMax'], { label: PDM.T('rel.mood') + ' 최대', int: true, def: 500 }), F.num(key, ['rules', 'moodPerAction'], { label: '행동 1번 최대', int: true, def: 200 }),
            F.num(key, ['rules', 'moodSoft', 0], { label: '완만해지는 기준 1', int: true, def: 50 }), F.num(key, ['rules', 'moodSoft', 1], { label: '기준 2', int: true, def: 100 }), F.num(key, ['rules', 'moodSoft', 2], { label: '기준 3', int: true, def: 200 })),
          row(F.bool(key, ['rules', 'crowdHalf'], { label: '다른 캐릭터가 보고 있으면 ' + PDM.T('rel.mood') + ' 절반' }),
            F.num(key, ['rules', 'temperChance'], { label: PDM.T('rel.temper') + ' 바뀔 확률(%/층)', int: true, min: 0, max: 100, def: 10 }),
            F.num(key, ['rules', 'curveK'], { label: '자극 곡선 k', int: true, def: 200, hint: '호감 += cap×v/(v+k) 합 /10' }), F.num(key, ['rules', 'curveCap'], { label: '자극 곡선 cap', int: true, def: 50 })),
          h('div', { class: 'fl mt-4' }, PDM.T('rel.fatigue') + ' · ' + PDM.T('rel.stress') + ' · ' + PDM.T('rel.jealousy')),
          row(F.num(key, ['rules', 'fatigueMax'], { label: PDM.T('rel.fatigue') + ' 한도(층)', int: true, def: 300, hint: '행동의 "피로"가 쌓여 넘으면 실패 (' + PDM.T('bond.partner') + '은 무시)' }),
            F.num(key, ['rules', 'stressRecover'], { label: PDM.T('rel.stress') + ' 층마다 회복', int: true, def: 30 }), F.num(key, ['rules', 'stressRecoverSafe'], { label: '쉬는 곳에서 회복', int: true, def: 200 })),
          row(...(sys.gauges || []).filter(g => ['gauge.fear', 'gauge.sorrow', 'gauge.tension', 'gauge.anger'].includes(g.key)).map(g => F.num(key, ['rules', 'stressFrom', g.key], { label: PDM.T(g.key) + ' → ' + PDM.T('rel.stress') + ' 비율', step: 0.05, def: 0 }))),
          row(F.bool(key, ['rules', 'jealousy'], { label: PDM.T('rel.jealousy') + ' 켜기 (곁에서 본 캐릭터가 분노)' }), F.num(key, ['rules', 'jealousyFavor'], { label: '이정표 없을 때 질투 시작 ' + PDM.T('rel.favor'), int: true, def: 500 }),
            ...['bond.partner', 'bond.close', 'bond.admire', 'favor'].map(b => F.num(key, ['rules', 'jealousyDiv', b], { label: (b === 'favor' ? PDM.T('rel.favor') : PDM.T(b)) + ' 나눔', int: true, min: 0, def: PDM.Heart.RULE_DEFAULTS.jealousyDiv[b], hint: '작을수록 질투 큼' }))),
          F.select(key, ['rules', 'gaugeReset'], { floor: '층을 떠날 때', talk: '대화가 끝날 때' }, { label: '게이지 결정화 시점' })),
        section(PDM.T('rel.accept') + ' (era 합의판정) — 부탁을 들어줄지',
          h('p', { class: 'hint' }, `점수 = ${PDM.T('rel.favor')} 표 + ${PDM.T('rel.trust')} 표 + 이정표 + 능력×점수 + 흔적×점수 + ${PDM.T('rel.mood')}÷나눔 + ${PDM.T('rel.temper')}×20. ${PDM.T('rel.sulk')}·${PDM.T('rel.displeased')} 중이면 단계 0. 태도 조건에서 acceptLv(0~3), accept 로 씁니다.`),
          h('div', { class: 'cols2' },
            h('div', {}, h('div', { class: 'fl' }, PDM.T('rel.favor') + ' 이상이면 → 점수'), tableEditor(['acceptance', 'favor'])),
            h('div', {}, h('div', { class: 'fl' }, PDM.T('rel.trust') + ' 이상이면 → 점수'), tableEditor(['acceptance', 'trust']))),
          row(...['bond.admire', 'bond.close', 'bond.partner'].map(b => F.num(key, ['acceptance', 'bonds', b], { label: PDM.T(b), int: true, def: PDM.Heart.ACCEPT_DEFAULTS.bonds[b] })),
            ...(sys.abilities || []).slice(0, 2).map(a => F.num(key, ['acceptance', 'abl', a.key], { label: PDM.T(a.key) + ' Lv당', int: true, def: (PDM.Heart.ACCEPT_DEFAULTS.abl[a.key] || 0) }))),
          row(...(sys.marks || []).map(m => F.num(key, ['acceptance', 'marks', m.key], { label: PDM.T(m.key) + ' 단계당', int: true, def: PDM.Heart.ACCEPT_DEFAULTS.marks[m.key] || 0 })),
            F.num(key, ['acceptance', 'moodDiv'], { label: PDM.T('rel.mood') + ' 나눔', int: true, min: 1, def: 5 })),
          row(F.num(key, ['acceptance', 'levels', 0], { label: '♥ 1단계', int: true, def: 100 }), F.num(key, ['acceptance', 'levels', 1], { label: '♥♥ 2단계', int: true, def: 250 }), F.num(key, ['acceptance', 'levels', 2], { label: '♥♥♥ 3단계', int: true, def: 450 }))),
        section('부탁 (era REJECT_CHECK)',
          h('p', { class: 'hint' }, `${PDM.T('rel.accept')} 점수가 "필요"보다 크면 들어줍니다. "메뉴"를 켜면 말 걸기 메뉴에 나오고, 이벤트 명령 "부탁하기"로 들어주면/거절하면 분기할 수 있습니다. 결과는 변수 req_<캐릭터>_<키> (1/−1) 에도 남습니다.`),
          listEditor(key, ['requests'], { addLabel: '부탁 추가', make: () => ({ key: 'NEW_REQUEST', name: '새 부탁', need: 200, moodNeed: 0, when: '', menu: true, okAction: '', noAction: 'REJECTED', event: '' }),
            render: (it, i, p) => h('div', {},
              row(F.text(key, [...p, 'key'], { label: '키', transform: v => v.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }), F.text(key, [...p, 'name'], { label: '이름' }),
                F.num(key, [...p, 'need'], { label: '필요 점수', int: true }), F.num(key, [...p, 'moodNeed'], { label: PDM.T('rel.mood') + ' 최소(비율)', step: 0.1, min: 0, max: 1 }), F.bool(key, [...p, 'menu'], { label: '메뉴' })),
              row(F.cond(key, [...p, 'when'], { label: '조건 (비우면 항상)' }), F.ref(key, [...p, 'okAction'], 'heartAction', { label: '들어주면 행동', empty: '(없음)' }),
                F.ref(key, [...p, 'noAction'], 'heartAction', { label: '거절하면 행동', empty: '(없음)' }), F.ref(key, [...p, 'event'], 'event', { label: '들어주면 이벤트', empty: '(없음)' }))) })),
        section('관계 단계', listEditor(key, ['stages'], { addLabel: '단계 추가', compact: true, make: () => ({ name: '새 단계', favor: 3000, trust: 1000 }),
          render: (it, i, p) => row(F.text(key, [...p, 'name'], { label: `${i}단계` }), F.num(key, [...p, 'favor'], { label: PDM.T('rel.favor'), int: true }), F.num(key, [...p, 'trust'], { label: PDM.T('rel.trust'), int: true })) })),
        section('행동표 (era 일상 커맨드)', h('p', { class: 'hint' }, 'TALK, GIFT_*, ATTACKED, IGNORED, TOGETHER, SAVED 는 게임이 자동으로 부르는 키입니다. "말 걸기 메뉴"를 켠 행동은 캐릭터에게 말을 걸 때 고를 수 있고, 나머지는 이벤트의 "행동 적용" 명령으로 부릅니다. 호감 = 기본 + (친밀+따름)/2 + 기분 + 성격 + 자극 곡선/10 − 반발 흔적.'),
          listEditor(key, ['actions'], { addLabel: '행동 추가', make: () => ({ key: 'NEW_ACTION', name: '새 행동', favor: 5, trust: 2, anger: 0, canLowerTrust: false, source: {}, success: 100, great: 0, fatigue: 0, perFloor: 0, menu: false }),
            render: (it, i, p) => h('div', {},
              row(F.text(key, [...p, 'key'], { label: '키', transform: v => v.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }), F.text(key, [...p, 'name'], { label: '이름' }),
                F.num(key, [...p, 'favor'], { label: PDM.T('rel.favor'), int: true }), F.num(key, [...p, 'trust'], { label: PDM.T('rel.trust'), int: true }), F.num(key, [...p, 'anger'], { label: PDM.T('rel.anger'), int: true })),
              row(F.bool(key, [...p, 'canLowerTrust'], { label: '신뢰 하락 가능' }), F.select(key, [...p, 'exp'], PDM.termKeys('exp.').map(k => [k, PDM.T(k)]), { label: '경험 횟수 +1', empty: '(없음)' }),
                F.num(key, [...p, 'success'], { label: '성공률 %', int: true, min: 0, max: 100, def: 100, hint: '100 = 항상. 아니면 ' + PDM.T('rel.accept') + '로 보정' }), F.num(key, [...p, 'great'], { label: '대성공 %', int: true, min: 0, max: 100, def: 0 })),
              row(F.num(key, [...p, 'fatigue'], { label: PDM.T('rel.fatigue'), int: true, min: 0, def: 0 }), F.num(key, [...p, 'perFloor'], { label: '층당 효과 횟수 (0=무제한)', int: true, min: 0, def: 0 }),
                F.bool(key, [...p, 'menu'], { label: '말 걸기 메뉴' }), F.bool(key, [...p, 'calm'], { label: '사과 (삐졌을 때만)' }), it.calm ? F.num(key, [...p, 'removeResent'], { label: PDM.T('mark.resent') + ' 지움', int: true, min: 0, max: 3, def: 0 }) : null),
              it.menu || it.topic ? row(F.cond(key, [...p, 'when'], { label: '메뉴에 나오는 조건' }), F.ref(key, [...p, 'topic'], 'topic', { label: '결과 대사 토픽', empty: '(자동)' }), F.ref(key, [...p, 'failTopic'], 'topic', { label: '실패 토픽', empty: '(같음)' })) : null,
              vec([...p, 'source'], PDM.T('sys.source') + ' → ' + PDM.T('sys.gauge'))) })),
        section(PDM.T('sys.trait') + ' (era 소질 보정)', listEditor(key, ['traits'], { addLabel: '성격 추가', make: () => ({ key: 'NEW_TRAIT', name: '새 성격', favorAdd: 0, trustAdd: 0, onlyPositive: false, halve: false, gaugeMul: {} }),
          render: (it, i, p) => h('div', {},
            row(F.text(key, [...p, 'key'], { label: '키', transform: v => v.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }), F.text(key, [...p, 'name'], { label: '이름' }),
              F.num(key, [...p, 'favorAdd'], { label: PDM.T('rel.favor') + ' 보정', int: true }), F.num(key, [...p, 'trustAdd'], { label: PDM.T('rel.trust') + ' 보정', int: true })),
            row(F.bool(key, [...p, 'onlyPositive'], { label: '좋은 일일 때만' }), F.bool(key, [...p, 'halve'], { label: '상승량 절반' }),
              it.halve ? F.select(key, [...p, 'halveUnless'], PDM.termKeys('bond.').map(k => [k, PDM.T(k)]), { label: '이 이정표가 있으면 안 줄어듦', empty: '(마지막 관계 단계)' }) : null),
            row(F.num(key, [...p, 'angerMul'], { label: PDM.T('rel.anger') + ' 배율', step: 0.1, min: 0, def: 1 }), F.num(key, [...p, 'temperMul'], { label: PDM.T('rel.temper') + ' 변화 확률 배율', step: 0.1, min: 0, def: 1, hint: '기분파 3, 감정 결여 0.5' }),
              F.num(key, [...p, 'jealousMul'], { label: PDM.T('rel.jealousy') + ' 배율', step: 0.1, min: 0, def: 1, hint: '0 = 질투 안 함' })),
            vec([...p, 'gaugeMul'], PDM.T('sys.gauge') + ' 배율 (비우면 1)')) })),
        section(PDM.T('sys.gauge') + ' → ' + PDM.T('sys.crystal'),
          listEditor(key, ['gauges'], { addLabel: '게이지 추가', compact: true, make: () => ({ key: 'gauge.new', crystal: (sys.crystals || [])[0], rate: 100 }),
            render: (it, i, p) => row(F.select(key, [...p, 'key'], PDM.termKeys('gauge.').map(k => [k, PDM.T(k) + ` (${k})`]), { label: '게이지' }), F.select(key, [...p, 'crystal'], gemOpts, { label: '굳어서 될 결정' }), F.num(key, [...p, 'rate'], { label: '결정 1개당 필요량', int: true, min: 1 }),
              F.select(key, [...p, 'valence'], [['1', '좋은 자극 (+)'], ['0', '중립'], ['-1', '나쁜 자극 (−)']], { label: '호감·무드에', number: true }),
              F.num(key, [...p, 'cap'], { label: '곡선 cap', int: true, def: 0, hint: '0 = 규칙 값' }), F.num(key, [...p, 'k'], { label: '곡선 k', int: true, def: 0 })) }),
          h('div', { class: 'field' }, h('span', { class: 'fl' }, PDM.T('sys.crystal') + ' 목록 (키는 crystal.<영문>, 이름은 용어 관리에서)'), F.list(key, ['crystals'], {})),
          h('p', { class: 'hint' }, '결정 이름: ', (sys.crystals || []).map(g => PDM.T(g)).join(' · ')),
          h('p', { class: 'hint' }, `${PDM.T('sys.crystal')}은 아이템이 아닙니다. 가방에 들어가거나 버리거나 쓸 수 없고, 캐릭터마다 숫자로만 쌓입니다. 게임에서는 화면 오른쪽 위의 하트 버튼(「${PDM.T('sys.heartWindow')}」 창)이나 이벤트 명령 "마음 창 열기"로 확인합니다. 조건식에서는 crystal.<이름> (다른 캐릭터는 char.<id>.crystal.<이름>) 으로 씁니다.`)),
        section(PDM.T('sys.ability'), listEditor(key, ['abilities'], { addLabel: '능력 추가', compact: true, make: () => ({ key: 'abl.new', max: 10, crystal: (sys.crystals || [])[0], alt: '', base: 3, growth: 2 }),
          render: (it, i, p) => row(F.select(key, [...p, 'key'], PDM.termKeys('abl.').map(k => [k, PDM.T(k)]), { label: '능력' }), F.num(key, [...p, 'max'], { label: '최대 Lv', int: true }),
            F.select(key, [...p, 'crystal'], gemOpts, { label: '쓰는 결정' }), F.select(key, [...p, 'alt'], gemOpts, { label: '대신 쓸 결정', empty: '(없음)' }),
            F.num(key, [...p, 'base'], { label: '기본 비용', int: true }), F.num(key, [...p, 'growth'], { label: '레벨당 배수', step: 0.1 })) })),
        section(PDM.T('sys.mark') + ' (era 각인)', listEditor(key, ['marks'], { addLabel: '흔적 추가', compact: true, make: () => ({ key: 'mark.new', gauge: gaugeKeys[0], levels: [800, 2000, 5000] }),
          render: (it, i, p) => row(F.select(key, [...p, 'key'], PDM.termKeys('mark.').map(k => [k, PDM.T(k)]), { label: '흔적' }), F.select(key, [...p, 'gauge'], gaugeOpts, { label: '원인 게이지' }),
            F.num(key, [...p, 'levels', 0], { label: '1단계', int: true }), F.num(key, [...p, 'levels', 1], { label: '2단계', int: true }), F.num(key, [...p, 'levels', 2], { label: '3단계', int: true })) })),
        section(PDM.T('rel.attitude') + ' (위에서부터 처음 맞는 것)', listEditor(key, ['attitudes'], { addLabel: '태도 추가', compact: true, make: () => ({ key: 'att.friendly', when: '' }),
          render: (it, i, p) => row(F.select(key, [...p, 'key'], PDM.termKeys('att.').map(k => [k, PDM.T(k)]), { label: '태도' }), F.cond(key, [...p, 'when'], { label: '조건' })) })),
        section('관계 이정표', h('p', { class: 'hint' }, '조건을 처음 만족하면 이벤트가 실행되고 이정표를 얻습니다 (고백·약속·갈등 같은 장면).'),
          listEditor(key, ['milestones'], { addLabel: '이정표 추가', compact: true, make: () => ({ key: 'bond.admire', when: '', event: '' }),
            render: (it, i, p) => h('div', {}, row(F.select(key, [...p, 'key'], PDM.termKeys('bond.').map(k => [k, PDM.T(k)]), { label: '이정표' }), F.cond(key, [...p, 'when'], { label: '조건' }), F.ref(key, [...p, 'event'], 'event', { label: '이벤트', empty: '(없음)' })),
              row(F.cond(key, [...p, 'blockedBy'], { label: '이 조건이면 못 얻음 (era: 반발 흔적 → 연모 불가)' }), F.select(key, [...p, 'replaces'], PDM.termKeys('bond.').map(k => [k, PDM.T(k)]), { label: '얻으면 대신할 이정표', empty: '(없음)' }))) })),
        section(PDM.T('sys.counter') + ' (era COUNTER — 플레이어 행동에 즉시 반응, 계기마다 하나만)',
          listEditor(key, ['counters'], { addLabel: '반응 추가', make: () => ({ trigger: 'heroLowHp', when: '', topic: '', action: '', event: '', chance: 100 }),
            render: (it, i, p) => h('div', {},
              row(F.select(key, [...p, 'trigger'], { heroLowHp: '플레이어 체력 30% 이하', heroKill: '플레이어가 적 처치', ignored: '오래 말을 안 검', attacked: '이 캐릭터를 공격', heroHeal: '플레이어가 회복', itemUse: '아이템 사용', floorEnter: '새 층 도착', bossDefeated: '보스 처치' }, { label: '계기' }),
                F.num(key, [...p, 'chance'], { label: '확률(%)', int: true, min: 0, max: 100 }), it.trigger === 'ignored' ? F.num(key, [...p, 'turns'], { label: '몇 턴 동안', int: true }) : h('span'),
                F.num(key, [...p, 'weight'], { label: '무게', int: true, min: 0, def: 100, hint: '같은 계기의 후보 중 하나만 무게로 뽑음' }), F.num(key, [...p, 'moodBonus'], { label: PDM.T('rel.mood') + ' 가득일 때 무게 배율+', step: 0.5, def: 0 }),
                F.bool(key, [...p, 'needWarm'], { label: '이번 층에 어울린 뒤에만' })),
              row(F.cond(key, [...p, 'when'], { label: '조건 (캐릭터 기준)' }), F.ref(key, [...p, 'topic'], 'topic', { label: '말할 토픽', empty: '(없음)' }),
                F.ref(key, [...p, 'action'], 'heartAction', { label: '적용할 행동', empty: '(없음)' }), F.ref(key, [...p, 'event'], 'event', { label: '이벤트', empty: '(없음)' }))) })),
        section('대사 토픽', h('p', { class: 'hint' }, '캐릭터 편집기의 대사 목록에 나오는 상황들입니다. 키를 바꾸면 기존 대사와 연결이 끊어지니 주의하세요.'),
          listEditor(key, ['topics'], { addLabel: '토픽 추가', compact: true, make: () => ({ key: 'new_topic', name: '새 토픽' }),
            render: (it, i, p) => row(F.text(key, [...p, 'key'], { label: '키', transform: v => PDM.slugId(v) }), F.text(key, [...p, 'name'], { label: '이름' })) })),
        section(PDM.T('sys.diary'), F.bool(key, ['diary', 'enabled'], { label: '층을 떠날 때 동료가 일기를 씀 (그 층에서 가장 컸던 감정 → 대사 토픽 diary, 조건에 gauge.* 사용)' })));
    }
  });
})();
