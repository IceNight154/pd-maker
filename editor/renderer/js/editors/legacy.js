// ================================================================
//  고급: Java 코드 생성기 (이전 pixel-dungeon-maker 흡수)
//   · 이전 메이커 화면을 그대로 안에 띄움 (코덱스·버프·스탠스·특수능력·영웅·특성 → Java 코드)
//   · 이전 메이커 데이터 가져오기: 호감도 → 마음 시스템, 시나리오 NPC → 캐릭터, 스프라이트 → PNG
// ================================================================
(function () {
  const { h } = PDM;
  const store = PDM.store;

  function toFileURL(p) {
    if (!pdm.isElectron) return p;
    const s = p.replace(/\\/g, '/');
    return 'file:///' + s.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:');
  }

  async function importLegacy(json) {
    const src = typeof json === 'string' ? JSON.parse(json) : json;
    const report = [];
    // 1) 호감도 → 마음 시스템
    if (src.affection) {
      const a = src.affection;
      store.edit('heart', '이전 호감도 가져오기', r => {
        Object.assign(r.rules, { maxValue: a.maxValue, trustRatio: a.trustRatio, capStart: a.capStart, angerMax: a.angerMax, angerDecay: a.angerDecay, decayTurns: a.decayTurns });
        if (a.stages) r.stages = a.stages.map(s => ({ name: s.nameKo, favor: s.favor, trust: s.trust }));
        (a.interactions || []).forEach(it => {
          const ex = r.actions.find(x => x.key === it.key);
          const v = { key: it.key, name: it.nameKo, favor: it.favor, trust: it.trust, anger: it.anger, canLowerTrust: !!it.canLowerTrust };
          if (ex) Object.assign(ex, v); else r.actions.push(Object.assign(v, { source: {} }));
        });
        (a.traits || []).forEach(t => {
          const ex = r.traits.find(x => x.key === t.key);
          const v = { key: t.key, name: t.nameKo, favorAdd: t.favorAdd, trustAdd: t.trustAdd, onlyPositive: !!t.onlyPositive, halve: !!t.halve };
          if (ex) Object.assign(ex, v); else r.traits.push(Object.assign(v, { gaugeMul: {} }));
        });
      });
      report.push(`호감도 규칙 → ${PDM.T('sys.heart')} (단계 ${(a.stages || []).length}, 행동 ${(a.interactions || []).length}, 성격 ${(a.traits || []).length})`);
    }
    // 2) 시나리오 NPC → 캐릭터
    (src.scenarios || []).forEach(sc => {
      const id = PDM.slugId(sc.className, 'npc');
      if (store.has('char:' + id)) { report.push(`건너뜀 (이미 있음): ${id}`); return; }
      const c = PDM.make.character(id, 'npc');
      c.name = sc.nameKo || sc.className; c.desc = sc.descKo || '';
      if (sc.spriteClass) c.sprite.sheet = 'game:sprites/' + sc.spriteClass.replace(/Sprite$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() + '.png';
      c.dialogue = {};
      if (sc.affection) {
        c.heart.enabled = true; c.heart.traits = sc.affTraits || [];
        c.heart.likes = (sc.liked || '').split(',').map(s => s.trim()).filter(Boolean).map(s => PDM.slugId(s));
        c.heart.dislikes = (sc.disliked || '').split(',').map(s => s.trim()).filter(Boolean).map(s => PDM.slugId(s));
        c.dialogue.greet = (sc.affLines || []).map((t, i) => ({ when: i ? `stage>=${i}` : '', face: '', text: t || '' })).filter(l => l.text);
        if (sc.angryLine) c.dialogue.sulk = [{ when: '', face: '', text: sc.angryLine }];
        if (sc.giftLiked) c.dialogue.gift_liked = [{ when: '', face: '', text: sc.giftLiked }];
        if (sc.giftNormal) c.dialogue.gift_normal = [{ when: '', face: '', text: sc.giftNormal }];
        if (sc.giftDisliked) c.dialogue.gift_disliked = [{ when: '', face: '', text: sc.giftDisliked }];
      } else {
        const n = (sc.stages || []).length;
        c.dialogue.greet = (sc.stages || []).map((s, i) => ({ when: i === n - 1 ? `exp.talked>=${i}` : `exp.talked==${i}`, face: '', text: s.textKo || '' }));
      }
      store.add('char:' + id, c, '이전 NPC 가져오기');
      report.push(`NPC → 캐릭터: ${c.name} (${id})`);
    });
    // 3) 픽셀 스프라이트 → PNG
    for (const sp of src.sprites || []) {
      const n = sp.size || 16; if (!sp.pixels) continue;
      const cv = document.createElement('canvas'); cv.width = cv.height = n;
      const g = cv.getContext('2d');
      sp.pixels.forEach((c, i) => { if (c) { g.fillStyle = c; g.fillRect(i % n, Math.floor(i / n), 1, 1); } });
      const rel = `assets/sprites/legacy/${PDM.slugId(sp.name, sp.id)}.png`;
      await pdm.writeDataURL(store.abs(rel), cv.toDataURL('image/png'));
      report.push(`스프라이트 → ${rel}`);
    }
    const rest = ['codices', 'buffs', 'stances', 'abilities', 'heroes', 'talents'].filter(k => (src[k] || []).length);
    if (rest.length) report.push(`코드 생성 전용 데이터(${rest.join(', ')})는 이전 메이커 화면에서 계속 쓰세요.`);
    return report;
  }
  PDM.importLegacy = importLegacy;

  PDM.registerEditor({
    id: 'legacy', icon: '☕', title: () => 'Java 코드 생성기',
    match: k => k === 'legacy',
    render(key, ctx) {
      const p = store.get('project');
      const dir = store.abs(p.legacyMaker || '../../pixel-dungeon-maker');
      const st = ctx.st = ctx.st || { view: 'info' };
      const doImport = async (path) => {
        try {
          const report = await importLegacy(await pdm.readText(path));
          PDM.log('이전 메이커 가져오기:', 'ok'); report.forEach(r => PDM.log('  ' + r));
          PDM.ui.modal('가져오기 완료', h('div', {}, report.map(r => h('div', {}, '· ' + r))), [['확인', null]]);
        } catch (e) { toast('가져오기 실패: ' + e.message, 'bad'); }
      };
      if (st.view === 'frame') {
        return h('div', { class: 'page full', style: { display: 'flex', flexDirection: 'column' } },
          h('div', { class: 'map-tools' }, h('button', { class: 'tool', onclick: () => { st.view = 'info'; ctx.refresh(); } }, '← 돌아가기'),
            h('span', { class: 'hint' }, '이전 메이커 (디자인 모드). 게임 적용·테스트는 start-maker.bat 으로 실행한 버전에서 하세요.')),
          h('iframe', { class: 'legacy', src: toFileURL(pdm.join(dir, 'pixel-dungeon-maker.html')), style: { flex: 1 } }));
      }
      return h('div', { class: 'page' },
        h('h1', {}, '고급: Java 코드 생성기'),
        h('p', { class: 'lead' }, '데이터만으로 표현하기 어려운 전투 메커니즘(코덱스 무기, 상태이상·버프, 스탠스, 방어구 특수능력, 영웅 클래스, 특성)은 이전 메이커가 Java 코드를 만들어 게임 저장소에 넣는 방식으로 계속 만듭니다.'),
        PDM.ui.section('이전 메이커',
          h('div', { class: 'kv' }, h('b', {}, '위치'), h('span', { class: 'mono' }, dir)),
          h('div', { style: { display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' } },
            h('button', { class: 'btn pri', onclick: () => { st.view = 'frame'; ctx.refresh(); } }, '여기서 열기'),
            pdm.isElectron ? h('button', { class: 'btn', onclick: () => pdm.openExternal(pdm.join(dir, 'start-maker.bat')) }, 'start-maker.bat 실행 (게임 적용·테스트)') : null)),
        PDM.ui.section('데이터 가져오기',
          h('p', { class: 'hint' }, '호감도 규칙 → ' + PDM.T('sys.heart') + ', 시나리오 NPC → 캐릭터(대사·성격·선물 취향 포함), 픽셀 스프라이트 → PNG 로 옮깁니다. 이미 있는 캐릭터 id 는 건너뜁니다. 실행 취소(Ctrl+Z)로 되돌릴 수 있습니다.'),
          h('div', { style: { display: 'flex', gap: '6px' } },
            h('button', { class: 'btn', onclick: () => doImport(pdm.join(dir, 'projects', 'autosave.json')) }, 'autosave.json 에서 가져오기'),
            h('button', { class: 'btn', onclick: async () => { const f = await pdm.openFile('이전 메이커 백업 JSON', ['json']); if (f) doImport(f); } }, '백업 파일 고르기…'))));
    }
  });
})();
