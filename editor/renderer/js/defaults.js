// ================================================================
//  프로젝트 기본값 — 새 프로젝트를 만들거나 파일이 빠졌을 때 사용
// ================================================================
PDM.defaults = {
  project() {
    return {
      format: 'pdmaker-project', version: PDM.FORMAT_VERSION,
      name: '새 픽셀 던전', author: '',
      gameRepo: '',   // 게임 저장소 (프로젝트 폴더 기준 상대 경로). 비우면 PDMaker 폴더 안의 game/shattered-pixel-dungeon-master 를 찾아 채움
      legacyMaker: '../../pixel-dungeon-maker',
      startHero: '', startDepth: 1, heartButton: true,
      plugins: [],                  // 켜진 플러그인 id (순서대로 불러옴)
      settings: { tileSize: 16, language: 'ko' }
    };
  },
  terms() { return { format: 'pdmaker-terms', version: PDM.FORMAT_VERSION, terms: {} }; },
  world() { return PDM.World.defaultWorld().world; },

  story() {
    return {
      format: 'pdmaker-story', version: PDM.FORMAT_VERSION,
      synopsis: '',
      switches: [],   // { id, name, group, note }
      variables: [],  // { id, name, group, initial, note }
      routes: [{ id: 'main', name: '기본 루트', when: '', note: '' }],
      beats: [],      // { id, chapter, floor, event, required, note }
      endings: [],    // { id, name, priority, when, scene, note }
      startEvent: ''
    };
  },
  /** 사운드 목록 (사운드 편집기) — 참조는 sound:<id> */
  /** 타이틀 화면 — 기본값은 지금 게임 저장소(pd-maker/game/…)의 타이틀과 같은 모습.
   *  style: '4.0' = SPD 4.0 이상 (폐허 시차 배경 · 화면 감추기 버튼 · 버튼 순서 설정→변경 내역), '3.x' = 그 전 (아치 배경). 안 주면 지금 저장소 (PDM.gameTitle4) */
  title(style) {
    const v4 = style ? style === '4.0' : PDM.gameTitle4 !== false;
    const order = v4 ? ['play', 'support', 'rankings', 'journal', 'news', 'settings', 'changes', 'about'] : ['play', 'support', 'rankings', 'journal', 'news', 'changes', 'settings', 'about'];
    return { format: 'pdmaker-title', version: PDM.FORMAT_VERSION, enabled: true, hideButton: v4,
      music: { tracks: [] },
      background: { archs: true, archStyle: 'game', archReverse: false, archDir: 'up', archSpeed: 20, archImages: { bg: '', fg: '' }, color: '', gradient: { enabled: false, color: '#0b1b3a', alpha: 0.55, from: 'top' },
        vignette: false, effect: 'none', effectDensity: 1, effectColor: '', effectFront: false, effectArea: 'screen' },
      menus: { background: true, music: true, layers: true, effect: false },
      layers: [],
      logo: { mode: 'game', image: '', text: '', subtitle: '', size: 16, color: '#ffd966', subColor: '#cccccc', scale: 1, y: 0, offsetY: 0, glow: true, torches: true, anim: 'none' },
      gate: { enabled: false, text: '화면을 누르세요', color: '#dddddd', blink: true, logoAfter: 'fade', idleReturn: 15 },
      buttons: { layout: 'game', columns: 3, firstWide: true, top: 0, width: 0, height: 20, gap: 3, offsetX: 0, style: '',
        anim: { enter: 'none', duration: 0.6, stagger: 0.08, distance: 24, idle: 'none', idleAmount: 2, idleSpeed: 1 },
        items: order.map(id => ({ id, label: '', visible: true, icon: '' })) },
      version: { visible: true, text: '' }, exit: { visible: true } };
  },
  /** 대사창 (dialogue.json) — 게임 MakerDialogue.DEFAULTS 와 같음 */
  dialogue() {
    return { format: 'pdmaker-dialogue', version: PDM.FORMAT_VERSION, mode: 'box',
      box: { style: 'round', color: '#ffffff', alpha: 0.94, border: '#b9b4c8', radius: 5, textColor: '#3a3448', fontSize: 8, height: 0.27, margin: 4, padding: 8, image: '', slice: 6, highlight: '#d0602a', align: 'left', hideHud: true },
      name: { show: true, pos: 'auto', color: '#3c3a48', textColor: '#ffffff', fontSize: 7, image: '', slice: 4 },
      illust: { show: true, side: 'left', height: 0.92, layer: 'front', avoidText: true, smooth: 'auto' },
      typing: { speed: 40, sound: '' },
      indicator: { show: true, color: '#8a82a8', image: '', anim: 'bob' },
      choice: { pos: 'middle', width: 0.42, fontSize: 0, textColor: '', textOnColor: '', image: '', imageOn: '', slice: 4 },
      sounds: { open: '', type: '', next: '', move: '', select: '' },
      text: { autoScale: true, scaleMax: 2, scale: 1, lineSpacing: 0, tracking: 0, shadow: false, shadowColor: '#000000', shadowX: 0.5, shadowY: 0.5, outline: false, outlineColor: '#000000', outlineWidth: 0.5, bold: false },
      fx: { effect: 'none', dur: 0.25, strength: 1, scope: 'all', emScale: 1 },   // 5차: 글자 연출 (런타임 MakerDialogue.DEFAULTS fx)
      layout: { enabled: false } };
  },
  /** 게임 아이템 바꾸기 (아이템 트리의 ▫ 게임 아이템 → 그림) — { items: { 'spd:<경로>': { sprite } } } */
  /** 글자 연출 (editors/textfx.js · 런타임 MakerTextFx) */
  /** 이펙트 · 파티클 (editors/effect.js · 런타임 MakerEffect) */
  /** 게임 글자 바꾸기 (editors/texts.js · 런타임 MakerTexts) */
  /** 노드 합성기 (editors/compose.js — 편집기에서만 계산, 게임에는 저장한 PNG 만) */
  compose() { return { format: 'pdmaker-compose', version: PDM.FORMAT_VERSION, list: [] }; },
  /** 화면 필터 (editors/filter.js · 런타임 MakerFilter) */
  /** 예고편 컷신 (editors/trailer.js · 런타임 MakerTrailer) */
  trailers() { return { format: 'pdmaker-trailers', version: PDM.FORMAT_VERSION, list: [] }; },
  /** 퀘스트 (editors/quests.js · 런타임 MakerQuests) */
  quests() { return { format: 'pdmaker-quests', version: PDM.FORMAT_VERSION, list: [] }; },
  /** 내 배지 (editors/badges.js · 런타임 MakerBadges) */
  badges() { return { format: 'pdmaker-badges', version: PDM.FORMAT_VERSION, list: [], orig: {} }; },
  filters() { return { format: 'pdmaker-filters', version: PDM.FORMAT_VERSION, list: [] }; },
  /** 모션 랩 (editors/motion.js — CSS · JS 로 만든 움직이는 그림, 게임에는 구운 PNG 시트만) */
  motion() { return { format: 'pdmaker-motion', version: PDM.FORMAT_VERSION, list: [] }; },
  texts() { return { format: 'pdmaker-texts', version: PDM.FORMAT_VERSION, texts: {} }; },
  effects() { return { format: 'pdmaker-effects', version: PDM.FORMAT_VERSION, list: [] }; },
  /** 조합 타일 (maps/tilecombos.json — 런타임 MakerCombos · MakerTileUnderlay). legacy = 분리된 타일셋 밑그림 대응표 (비우면 기본 PDM.TILE_LEGACY_DEFAULT) */
  //  autogenVersion 2 = 자동 생성 배치가 목록 순서와 상관없음 (새로 만드는 파일만 — 값이 없는 예전 파일은 1 = 예전 배치 그대로, MakerCombos.autogen)
  tilecombos() { return { format: 'pdmaker-tilecombos', version: PDM.FORMAT_VERSION, autogenVersion: 2, legacy: [], list: [] }; },
  textfx() { return { format: 'pdmaker-textfx', version: PDM.FORMAT_VERSION, list: [] }; },
  gameitems() { return { format: 'pdmaker-gameitems', version: PDM.FORMAT_VERSION, items: {} }; },
  sounds() {
    return { format: 'pdmaker-sounds', version: PDM.FORMAT_VERSION, sounds: [] };
  },
  heart() {
    const G = (key, crystal, rate, valence) => ({ key, crystal, rate, valence });
    return {
      format: 'pdmaker-heart', version: PDM.FORMAT_VERSION,
      // era 호감도·신뢰도 규칙 (기존 메이커 호감도 탭과 같음)
      rules: { maxValue: 10000, trustRatio: 4, capStart: 500, trustK: 20, angerMax: 1000, angerDecay: 20, decayTurns: 10, angerFloorKeep: 0.5, gaugeReset: 'floor',
        // eraTW 규칙 (마음 시스템 2): 무드·기분·언짢음·대화 피로·스트레스·질투 — 설명은 DESIGN.md §4.7
        moodMax: 500, moodSoft: [50, 100, 200], moodPerAction: 200, crowdHalf: true,
        temperChance: 10, displeasedFloors: 1, resentLock: 3, sulkMark: 0, fatigueMax: 300, curveK: 200, curveCap: 50,
        stressTiers: [100, 250, 500, 1000, 3000], stressMul: [1, 0.9, 0.85, 0.8, 0.7, 0.6],
        stressFrom: { 'gauge.fear': 0.2, 'gauge.sorrow': 0.2, 'gauge.tension': 0.05 }, stressRecover: 30, stressRecoverSafe: 200,
        jealousy: true, jealousyFavor: 500, jealousyDiv: { 'bond.partner': 3, 'bond.close': 5, 'bond.admire': 5, favor: 8 },
        bondTrustK: { 'bond.admire': 30, 'bond.close': 30, 'bond.partner': 40 } },
      // 마음 열림 (era 합의판정): 표의 [기준, 점수] 중 넘은 것 가운데 가장 큰 것 + 이정표·능력·흔적·무드/moodDiv + 기분×20
      acceptance: {
        favor: [[0, 0], [100, 30], [300, 50], [800, 75], [1500, 100], [3000, 150], [6000, 200]],
        trust: [[0, -30], [30, -10], [100, 0], [300, 30], [500, 50], [1000, 100]],
        bonds: { 'bond.admire': 30, 'bond.close': 60, 'bond.partner': 100 }, abl: { 'abl.intimacy': 10 }, moodDiv: 5,
        marks: { 'mark.joy': 20, 'mark.awe': 10, 'mark.resent': -30, 'mark.fear': -20, 'mark.hurt': -10 }, levels: [100, 250, 450] },
      // 부탁 (era REJECT_CHECK): 마음 열림 점수 > need 이면 들어줌. menu = 말 걸기 메뉴에 표시
      requests: [
        { key: 'FOLLOW', name: '같이 가자고 부탁', need: 100, moodNeed: 0, when: '', menu: true, okAction: '', noAction: 'REJECTED', event: '' },
        { key: 'SECRET', name: '속마음 묻기', need: 250, moodNeed: 0.3, when: '', menu: true, okAction: 'CONFIDE', noAction: 'REJECTED', event: '' },
        { key: 'CONFESS', name: '마음 고백', need: 450, moodNeed: 0.6, when: 'bond.close', menu: true, okAction: '', noAction: 'REJECTED', event: '' }
      ],
      stages: [
        { name: '낯선 사이', favor: 0, trust: 0 },
        { name: '안면이 있음', favor: 50, trust: 10 },
        { name: '친구', favor: 200, trust: 60 },
        { name: '믿음직한 동료', favor: 600, trust: 200 },
        { name: '둘도 없는 벗', favor: 1500, trust: 500 }
      ],
      // 감정 게이지 → 마음의 결정 (rate 만큼 쌓이면 결정 1개)
      gauges: [
        G('gauge.joy', 'crystal.joy', 100, 1), G('gauge.relief', 'crystal.relief', 100, 1), G('gauge.tension', 'crystal.tension', 100, 0),
        G('gauge.fear', 'crystal.fear', 100, -1), G('gauge.anger', 'crystal.anger', 100, -1), G('gauge.shy', 'crystal.shy', 100, 0),
        G('gauge.respect', 'crystal.respect', 100, 1), G('gauge.sorrow', 'crystal.sorrow', 100, -1)
      ],
      // 마음의 결정 (era JUEL) — 감정 게이지가 층을 떠날 때 굳은 것. 아이템이 아니라 숫자로만 존재
      crystals: ['crystal.joy', 'crystal.relief', 'crystal.tension', 'crystal.fear', 'crystal.anger', 'crystal.shy', 'crystal.respect', 'crystal.sorrow'],
      // 행동표: 기본 호감·신뢰·분노 + 자극(source → 게이지)
      actions: [
        // success/great: 성공률·대성공률(%) · fatigue: 대화 피로 · perFloor: 층당 효과 있는 횟수 · menu: 말 걸기 메뉴 · calm: 삐졌을 때만(사과)
        { key: 'TALK', name: '대화', favor: 3, trust: 1, anger: 0, canLowerTrust: false, source: { 'gauge.joy': 40, 'gauge.relief': 30 }, exp: 'exp.talked', success: 95, great: 5, fatigue: 75, menu: true },
        { key: 'PRAISE', name: '칭찬하기', favor: 4, trust: 0, anger: 0, canLowerTrust: false, source: { 'gauge.joy': 60, 'gauge.shy': 60 }, success: 85, great: 10, fatigue: 50, perFloor: 1, menu: true, when: 'stage>=1', topic: 'praise', failTopic: 'praise_fail' },
        { key: 'COMFORT', name: '위로하기', favor: 3, trust: 3, anger: 0, canLowerTrust: false, source: { 'gauge.relief': 120 }, success: 90, great: 10, perFloor: 1, menu: true, when: 'gauge.fear>=100 || gauge.sorrow>=100 || stress>=250', topic: 'comforted' },
        { key: 'APOLOGIZE', name: '사과하기', favor: 0, trust: 0, anger: 0, canLowerTrust: false, source: {}, success: 40, great: 10, calm: true, menu: true, removeResent: 0 },
        { key: 'CONFIDE', name: '속마음을 들음', favor: 10, trust: 15, anger: 0, canLowerTrust: false, source: { 'gauge.relief': 150, 'gauge.shy': 100 } },
        { key: 'REJECTED', name: '부탁을 거절함', favor: 0, trust: 0, anger: 60, canLowerTrust: false, source: { 'gauge.tension': 40 } },
        { key: 'GIFT_LIKED', name: '좋아하는 선물', favor: 20, trust: 3, anger: 0, canLowerTrust: false, source: { 'gauge.joy': 300, 'gauge.shy': 80 }, exp: 'exp.gifted' },
        { key: 'GIFT_NORMAL', name: '평범한 선물', favor: 6, trust: 1, anger: 0, canLowerTrust: false, source: { 'gauge.joy': 80 }, exp: 'exp.gifted' },
        { key: 'GIFT_DISLIKED', name: '싫어하는 선물', favor: -8, trust: -2, anger: 300, canLowerTrust: true, source: { 'gauge.anger': 200, 'gauge.sorrow': 60 } },
        { key: 'QUEST', name: '부탁 해결', favor: 40, trust: 20, anger: 0, canLowerTrust: false, source: { 'gauge.respect': 300, 'gauge.joy': 150 } },
        { key: 'TOGETHER', name: '함께 싸우기', favor: 2, trust: 3, anger: 0, canLowerTrust: false, source: { 'gauge.tension': 60, 'gauge.respect': 30 }, exp: 'exp.fought' },
        { key: 'SAVED', name: '위기에서 구함', favor: 30, trust: 25, anger: 0, canLowerTrust: false, source: { 'gauge.relief': 400, 'gauge.respect': 200 }, exp: 'exp.saved' },
        { key: 'IGNORED', name: '오래 무시함', favor: -2, trust: 0, anger: 60, canLowerTrust: false, source: { 'gauge.sorrow': 80 }, exp: 'exp.ignored' },
        { key: 'RUDE', name: '무례한 행동', favor: -15, trust: -5, anger: 400, canLowerTrust: true, source: { 'gauge.anger': 300 } },
        { key: 'ATTACKED', name: '공격당함', favor: -60, trust: -40, anger: 900, canLowerTrust: true, source: { 'gauge.fear': 500, 'gauge.anger': 500 } }
      ],
      // 성격 (era 소질 보정) + 게이지 배율
      traits: [
        { key: 'REBELLIOUS', name: '반항적', favorAdd: -2, trustAdd: -1, onlyPositive: false, halve: false, gaugeMul: { 'gauge.anger': 1.5 }, angerMul: 1.2 },
        { key: 'PROUD', name: '자존심 높음', favorAdd: -1, trustAdd: 0, onlyPositive: false, halve: false, gaugeMul: { 'gauge.respect': 0.7 } },
        { key: 'HONEST', name: '솔직함', favorAdd: 1, trustAdd: 1, onlyPositive: true, halve: false, gaugeMul: {} },
        { key: 'DEVOTED', name: '헌신적', favorAdd: 1, trustAdd: 1, onlyPositive: true, halve: false, gaugeMul: { 'gauge.relief': 1.2 } },
        { key: 'CHEERFUL', name: '명랑', favorAdd: 1, trustAdd: 1, onlyPositive: true, halve: false, gaugeMul: { 'gauge.joy': 1.3, 'gauge.sorrow': 0.7 } },
        { key: 'SHY', name: '부끄럼쟁이', favorAdd: 0, trustAdd: 0, onlyPositive: false, halve: false, gaugeMul: { 'gauge.shy': 1.8 } },
        { key: 'TIMID', name: '겁쟁이', favorAdd: 0, trustAdd: 0, onlyPositive: false, halve: false, gaugeMul: { 'gauge.fear': 1.6 } },
        { key: 'CURIOUS', name: '호기심 많음', favorAdd: 1, trustAdd: 0, onlyPositive: true, halve: false, gaugeMul: { 'gauge.joy': 1.1 } },
        { key: 'EMOTIONLESS', name: '감정 결여', favorAdd: -1, trustAdd: -1, onlyPositive: false, halve: false, gaugeMul: { 'gauge.joy': 0.5, 'gauge.shy': 0.5 }, temperMul: 0.5, jealousMul: 0 },
        { key: 'INDIFFERENT', name: '무관심', favorAdd: 0, trustAdd: 0, onlyPositive: false, halve: true, halveUnless: 'bond.partner', gaugeMul: {} },
        // angerMul: 분노 배율 · temperMul: 기분이 바뀔 확률 배율 · jealousMul: 질투 배율 (0 = 질투 안 함)
        { key: 'MOODY', name: '기분파', favorAdd: 0, trustAdd: 0, onlyPositive: false, halve: false, gaugeMul: {}, temperMul: 3 },
        { key: 'JEALOUS', name: '질투가 많음', favorAdd: 0, trustAdd: 0, onlyPositive: false, halve: false, gaugeMul: { 'gauge.anger': 1.2 }, jealousMul: 2 },
        { key: 'CALM', name: '침착함', favorAdd: 0, trustAdd: 0, onlyPositive: false, halve: false, gaugeMul: { 'gauge.anger': 0.7 }, angerMul: 0.6, temperMul: 0.5 },
        { key: 'HOTHEADED', name: '다혈질', favorAdd: 0, trustAdd: 0, onlyPositive: false, halve: false, gaugeMul: { 'gauge.anger': 1.3 }, angerMul: 1.5 }
      ],
      // 관계 능력: 레벨 n → n+1 비용 = base × growth^n 개
      abilities: [
        { key: 'abl.intimacy', max: 10, crystal: 'crystal.joy', alt: 'crystal.shy', base: 3, growth: 2 },
        { key: 'abl.deference', max: 10, crystal: 'crystal.respect', alt: 'crystal.relief', base: 3, growth: 2 },
        { key: 'abl.talk', max: 10, crystal: 'crystal.joy', alt: 'crystal.relief', base: 2, growth: 2 },
        { key: 'abl.combat', max: 10, crystal: 'crystal.tension', alt: 'crystal.respect', base: 3, growth: 2 }
      ],
      // 흔적: 한 층에서 게이지가 기준을 넘으면 단계가 오름 (0~3)
      marks: [
        { key: 'mark.fear', gauge: 'gauge.fear', levels: [800, 2000, 5000] },
        { key: 'mark.resent', gauge: 'gauge.anger', levels: [800, 2000, 5000] },
        { key: 'mark.hurt', gauge: 'gauge.sorrow', levels: [800, 2000, 5000] },
        { key: 'mark.joy', gauge: 'gauge.joy', levels: [1500, 4000, 9000] },
        { key: 'mark.awe', gauge: 'gauge.respect', levels: [1500, 4000, 9000] }
      ],
      // 태도: 위에서부터 처음 맞는 것
      attitudes: [
        { key: 'att.hostile', when: 'sulk || anger>=800 || mark.resent>=2' },
        { key: 'att.devoted', when: 'acceptLv>=3' },
        { key: 'att.trusting', when: 'acceptLv>=2' },
        { key: 'att.friendly', when: 'acceptLv>=1' },
        { key: 'att.wary', when: 'mark.fear>=1 || favor<0' },
        { key: 'att.indifferent', when: '' }
      ],
      // 관계 이정표: 조건을 처음 만족하면 이벤트 실행 + 이정표 획득
      milestones: [
        // blockedBy: 이 조건이면 못 얻음 (era: 반발 흔적이 있으면 연모 불가) · replaces: 얻으면 아래 이정표를 대신함 (사모 → 연모)
        { key: 'bond.admire', when: 'favor>=300 && trust>=100', event: '', blockedBy: '', replaces: '' },
        { key: 'bond.close', when: 'favor>=800 && trust>=300 && abl.intimacy>=3', event: '', blockedBy: 'mark.resent>=1', replaces: '' },
        { key: 'bond.partner', when: 'favor>=2000 && trust>=800 && abl.intimacy>=6 && bond.close', event: '', blockedBy: 'mark.resent>=1', replaces: '' }
      ],
      // 반응 (era COUNTER): 계기 → 대사 토픽 / 행동 / 이벤트
      counters: [
        { trigger: 'heroLowHp', when: 'att.friendly || att.trusting || att.devoted', topic: 'low_hp', action: '', event: '', chance: 100 },
        { trigger: 'heroKill', when: '', topic: 'hero_kill', action: 'TOGETHER', event: '', chance: 30 },
        { trigger: 'ignored', when: 'favor>=100', topic: 'ignored', action: 'IGNORED', event: '', chance: 100, turns: 300 },
        { trigger: 'attacked', when: '', topic: 'attacked', action: 'ATTACKED', event: '', chance: 100 },
        { trigger: 'floorEnter', when: 'temper<0', topic: 'bad_temper', action: '', event: '', chance: 50, weight: 100 },
        { trigger: 'floorEnter', when: 'temper>0', topic: 'good_temper', action: '', event: '', chance: 50, weight: 100 }
      ],
      // 대사 토픽 (캐릭터 대사 편집기의 목록)
      topics: [
        { key: 'greet', name: '인사(말 걸기)' }, { key: 'talk', name: '잡담' },
        { key: 'gift_liked', name: '좋아하는 선물' }, { key: 'gift_normal', name: '평범한 선물' }, { key: 'gift_disliked', name: '싫어하는 선물' },
        { key: 'sulk', name: '삐졌을 때' }, { key: 'stage_up', name: '관계 단계 상승' },
        { key: 'low_hp', name: '플레이어 체력 낮음' }, { key: 'hero_kill', name: '플레이어가 적 처치' }, { key: 'attacked', name: '공격당함' },
        { key: 'ignored', name: '오래 무시당함' }, { key: 'floor_enter', name: '새 층 도착' }, { key: 'boss_defeated', name: '보스 처치' },
        { key: 'diary', name: '일기(층을 떠날 때)' },
        { key: 'talk_tired', name: '대화 피로(오늘은 그만)' }, { key: 'praise', name: '칭찬받음' }, { key: 'praise_fail', name: '칭찬 실패' }, { key: 'comforted', name: '위로받음' },
        { key: 'apology_ok', name: '사과 받아줌' }, { key: 'apology_fail', name: '사과 안 받아줌' }, { key: 'jealous', name: '질투' },
        { key: 'request_ok', name: '부탁 들어줌' }, { key: 'request_no', name: '부탁 거절' }, { key: 'bad_temper', name: '기분 나쁜 날' }, { key: 'good_temper', name: '기분 좋은 날' }
      ],
      diary: { enabled: true }
    };
  }
};
