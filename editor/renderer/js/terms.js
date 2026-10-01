// ================================================================
//  용어 사전 — 화면에 보이는 이름은 전부 여기서 가져옵니다.
//  · 코드/데이터의 키(왼쪽)는 중립적인 영어로 고정
//  · 표시 이름(label)은 프로젝트의 terms.json 에서 언제든 바꿀 수 있음 (도구 → 용어 관리)
//  · eraRef 는 era 원본 시스템의 어느 자리를 대체했는지만 기록 (원래 단어는 남기지 않음)
// ================================================================
PDM.DEFAULT_TERMS = {
  // ---- 관계 수치 (era CFLAG) ----
  'rel.favor':        { label: '호감도', eraRef: 'CFLAG:2', group: '관계 수치' },
  'rel.trust':        { label: '신뢰도', eraRef: 'CFLAG:4', group: '관계 수치' },
  'rel.anger':        { label: '분노', eraRef: 'BASE:12', group: '관계 수치' },
  'rel.acquaint':     { label: '안면', eraRef: 'CFLAG:18', group: '관계 수치' },
  'rel.mood':         { label: '무드', eraRef: 'BASE:10', group: '관계 수치', note: '이번 층에서 쌓인 좋은 분위기 (층마다 0)' },
  'rel.temper':       { label: '기분', eraRef: 'TALENT:15', group: '관계 수치', note: '−1 나쁨 / 0 보통 / +1 좋음, 층마다 확률로 바뀜' },
  'rel.sulk':         { label: '삐짐', eraRef: 'CFLAG:318', group: '관계 수치' },
  'rel.displeased':   { label: '언짢음', eraRef: 'CFLAG:322', group: '관계 수치', note: '삐진 뒤 남은 층 수 — 이 동안 분노가 풀리지 않음' },
  'rel.attitude':     { label: '태도', eraRef: 'CFLAG:6', group: '관계 수치' },
  'rel.accept':       { label: '마음 열림', eraRef: 'CFLAG:19', group: '관계 수치', note: '부탁을 들어줄지 정하는 점수 (호감·신뢰·이정표·무드)' },
  'rel.stress':       { label: '스트레스', eraRef: 'CFLAG:65 (THYM)', group: '관계 수치' },
  'rel.jealousy':     { label: '질투', eraRef: 'CFLAG:30 (THYM)', group: '관계 수치' },
  'rel.fatigue':      { label: '대화 피로', eraRef: 'TCVAR:301', group: '관계 수치' },
  'temper.good':      { label: '좋음', eraRef: 'TALENT:15=1', group: '관계 수치' },
  'temper.normal':    { label: '보통', eraRef: 'TALENT:15=0', group: '관계 수치' },
  'temper.bad':       { label: '나쁨', eraRef: 'TALENT:15=-1', group: '관계 수치' },

  // ---- 감정 게이지 (era PALAM) ----
  'gauge.joy':        { label: '기쁨', eraRef: 'PALAM', group: '감정 게이지' },
  'gauge.relief':     { label: '안심', eraRef: 'PALAM', group: '감정 게이지' },
  'gauge.tension':    { label: '긴장', eraRef: 'PALAM', group: '감정 게이지' },
  'gauge.fear':       { label: '두려움', eraRef: 'PALAM', group: '감정 게이지' },
  'gauge.anger':      { label: '화남', eraRef: 'PALAM', group: '감정 게이지' },
  'gauge.shy':        { label: '수줍음', eraRef: 'PALAM', group: '감정 게이지' },
  'gauge.respect':    { label: '존경', eraRef: 'PALAM', group: '감정 게이지' },
  'gauge.sorrow':     { label: '슬픔', eraRef: 'PALAM', group: '감정 게이지' },

  // ---- 마음의 결정 (era JUEL) — 감정 게이지가 굳은 것 ----
  'crystal.joy':      { label: '기쁨의 결정', eraRef: 'JUEL', group: '마음의 결정' },
  'crystal.relief':   { label: '안심의 결정', eraRef: 'JUEL', group: '마음의 결정' },
  'crystal.tension':  { label: '긴장의 결정', eraRef: 'JUEL', group: '마음의 결정' },
  'crystal.fear':     { label: '두려움의 결정', eraRef: 'JUEL', group: '마음의 결정' },
  'crystal.anger':    { label: '분노의 결정', eraRef: 'JUEL', group: '마음의 결정' },
  'crystal.shy':      { label: '수줍음의 결정', eraRef: 'JUEL', group: '마음의 결정' },
  'crystal.respect':  { label: '존경의 결정', eraRef: 'JUEL', group: '마음의 결정' },
  'crystal.sorrow':   { label: '슬픔의 결정', eraRef: 'JUEL', group: '마음의 결정' },

  // ---- 관계 능력 (era ABL) ----
  'abl.intimacy':     { label: '친밀', eraRef: 'ABL:9', group: '관계 능력' },
  'abl.deference':    { label: '따름', eraRef: 'ABL:10', group: '관계 능력' },
  'abl.talk':         { label: '대화술', eraRef: 'ABL:41', group: '관계 능력' },
  'abl.combat':       { label: '전투 협력', eraRef: 'ABL:42', group: '관계 능력' },
  'abl.cooking':      { label: '요리', eraRef: 'ABL:44', group: '관계 능력' },
  'abl.alchemy':      { label: '조제', eraRef: 'ABL:48', group: '관계 능력' },

  // ---- 흔적 (era MARK) ----
  'mark.fear':        { label: '두려움의 흔적', eraRef: 'MARK:8', group: '흔적' },
  'mark.resent':      { label: '반감의 흔적', eraRef: 'MARK:9', group: '흔적' },
  'mark.hurt':        { label: '상처의 흔적', eraRef: 'MARK:0', group: '흔적' },
  'mark.joy':         { label: '기쁨의 흔적', eraRef: 'MARK:1 (대체)', group: '흔적' },
  'mark.awe':         { label: '경외의 흔적', eraRef: 'MARK:2 (대체)', group: '흔적' },

  // ---- 관계 이정표 (era TALENT 관계 비트) ----
  'bond.admire':      { label: '동경', eraRef: 'CFLAG:31 bit0 (대체)', group: '관계 이정표' },
  'bond.close':       { label: '친애', eraRef: 'CFLAG:31 bit1 (대체)', group: '관계 이정표' },
  'bond.partner':     { label: '반려', eraRef: 'CFLAG:1 bit5 (대체)', group: '관계 이정표' },

  // ---- 경험 횟수 (era EXP) ----
  'exp.talked':       { label: '대화 횟수', eraRef: 'EXP', group: '경험' },
  'exp.fought':       { label: '함께 싸운 횟수', eraRef: 'EXP', group: '경험' },
  'exp.saved':        { label: '구해준 횟수', eraRef: 'EXP', group: '경험' },
  'exp.gifted':       { label: '선물 횟수', eraRef: 'EXP', group: '경험' },
  'exp.ignored':      { label: '무시당한 횟수', eraRef: 'EXP', group: '경험' },

  // ---- 태도 (era ATTITUDE) ----
  'att.hostile':      { label: '적대', eraRef: 'ATTITUDE', group: '태도' },
  'att.wary':         { label: '경계', eraRef: 'ATTITUDE', group: '태도' },
  'att.indifferent':  { label: '무관심', eraRef: 'ATTITUDE', group: '태도' },
  'att.friendly':     { label: '우호', eraRef: 'ATTITUDE', group: '태도' },
  'att.trusting':     { label: '신뢰', eraRef: 'ATTITUDE', group: '태도' },
  'att.devoted':      { label: '헌신', eraRef: 'ATTITUDE', group: '태도' },

  // ---- 시스템 이름 ----
  'sys.heart':        { label: '마음 시스템', eraRef: '-', group: '시스템' },
  'sys.crystal':      { label: '마음의 결정', eraRef: 'JUEL', group: '시스템' },
  'sys.gauge':        { label: '감정 게이지', eraRef: 'PALAM', group: '시스템' },
  'sys.source':       { label: '자극', eraRef: 'SOURCE', group: '시스템' },
  'sys.ability':      { label: '관계 능력', eraRef: 'ABL', group: '시스템' },
  'sys.trait':        { label: '성격', eraRef: 'TALENT', group: '시스템' },
  'sys.mark':         { label: '흔적', eraRef: 'MARK', group: '시스템' },
  'sys.counter':      { label: '반응', eraRef: 'COUNTER', group: '시스템' },
  'sys.dialogue':     { label: '구상 대사', eraRef: 'KOJO', group: '시스템' },
  'sys.diary':        { label: '일기', eraRef: 'DIARY', group: '시스템' },
  'sys.heartWindow':  { label: '마음', eraRef: '-', group: '시스템', note: '게임 화면의 마음 창 제목 (결정은 아이템이 아니라 이 창의 숫자로만 존재)' },
  'sys.stage':        { label: '관계 단계', eraRef: '-', group: '시스템' },
  'sys.bond':         { label: '관계 이정표', eraRef: '-', group: '시스템' },
  'sys.exp':          { label: '경험', eraRef: 'EXP', group: '시스템' }
};

/** T('rel.favor') → '호감도'  (프로젝트 terms.json 이 우선) */
PDM.T = function (key, fallback) {
  const t = PDM.store && PDM.store.get('terms');
  const v = t && t.terms && t.terms[key];
  if (v && v.label) return v.label;
  const d = PDM.DEFAULT_TERMS[key];
  return d ? d.label : (fallback !== undefined ? fallback : key);
};
PDM.termKeys = function (prefix) {
  const t = (PDM.store && PDM.store.get('terms') || {}).terms || {};
  const keys = new Set([...Object.keys(PDM.DEFAULT_TERMS), ...Object.keys(t)]);
  return [...keys].filter(k => !prefix || k.startsWith(prefix)).sort((a, b) => {
    const ia = Object.keys(PDM.DEFAULT_TERMS).indexOf(a), ib = Object.keys(PDM.DEFAULT_TERMS).indexOf(b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.localeCompare(b);
  });
};
