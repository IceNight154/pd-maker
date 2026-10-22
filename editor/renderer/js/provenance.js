// ================================================================
//  데이터 출처 (10차) — 리소스의 칸마다 "어디서 온 값인지"를 기록하고, 저장소를 다시 읽을 때 사용자 편집을 지킴
//
//  리소스 o 에 붙는 것 (모르는 필드처럼 저장 · 불러오기를 거쳐 그대로 남음):
//    o.src = { profile: '<저장소 프로파일 id>', repo: '<폴더 이름>', at: '<ISO 시각>',
//              fields: { '<칸 경로>': { from: 'repo' | 'derived' | 'default', v: <그때 넣은 값>, file, line, key, note } } }
//      from  repo    = 선택한 저장소에서 직접 읽은 값 (번역 글 · 상수 · 리터럴)
//            derived = 저장소 코드 · 리소스에서 추론한 값 (상속으로 이어받음 · 기본 시트 · 분류 점수 …)
//            default = PDMaker 공통 기본값 (원작 SPD 묶음 · 새 리소스 기본)
//      v     = 그 출처에서 넣은 값. 지금 값이 v 와 다르면 = 사용자가 고친 값 ('user')
//
//  다시 맞추기 규칙 (sync):
//    · 지금 값 = 기록된 v (사용자가 안 고침)          → 새 저장소 값으로 바꿈
//    · 지금 값 ≠ v (사용자가 고침)                     → 그대로 둠. 저장소 값이 바뀌었으면 "충돌"로 보고
//    · 기록이 없는 예전 프로젝트: 지금 값 = legacyDefault(원작 SPD 기본값)이면 기본값으로 보고 바꿈, 아니면 사용자 값으로 지킴
//    · 저장소에서 값을 못 읽음(undefined)             → 지금 값을 지움 · 바꾸지 않음 (실패가 정상 데이터를 덮지 않게)
// ================================================================
PDM.prov = (function () {
  const J = v => JSON.stringify(v === undefined ? null : v);
  const same = (a, b) => J(a) === J(b);
  const getPath = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const setPath = (o, p, v) => { const ks = String(p).split('.'); let c = o; ks.slice(0, -1).forEach(k => { if (c[k] == null || typeof c[k] !== 'object') c[k] = {}; c = c[k]; }); c[ks[ks.length - 1]] = v; };
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

  /** 칸의 지금 출처: 'repo' | 'derived' | 'default' | 'user' | 'unknown' */
  function status(o, path) {
    const f = o && o.src && o.src.fields && o.src.fields[path];
    if (!f) return 'unknown';
    return same(getPath(o, path), f.v) ? f.from : 'user';
  }
  /** 칸에 출처를 기록 (값도 넣음) */
  function mark(o, path, value, from, meta) {
    setPath(o, path, clone(value));
    o.src = o.src || { fields: {} }; o.src.fields = o.src.fields || {};
    o.src.fields[path] = Object.assign({ from, v: clone(value) }, meta || {});
  }
  /** 칸 하나 다시 맞추기 → { action: 'set' | 'same' | 'keep-user' | 'conflict' | 'no-value', path, cur, next, was }
   *   want = { value, from: 'repo'|'derived'|'default', file, line, key, note } (value 가 undefined = 저장소에서 못 읽음)
   *   opt.legacyDefault = 기록이 없을 때 "기본값"으로 볼 값 (원작 SPD 묶음 값) — 함수면 지금 값을 받아 참/거짓 */
  function sync(o, path, want, opt) {
    opt = opt || {};
    const cur = getPath(o, path), rec = o.src && o.src.fields && o.src.fields[path];
    const res = { path, cur: clone(cur), next: want ? clone(want.value) : undefined, was: rec ? rec.from : null };
    if (!want || want.value === undefined) { res.action = 'no-value'; return res; }
    const meta = {}; ['file', 'line', 'key', 'note'].forEach(k => { if (want[k] !== undefined && want[k] !== '') meta[k] = want[k]; });
    let untouched;
    if (rec) untouched = same(cur, rec.v);
    else if (cur === undefined || cur === null || cur === '') untouched = true;
    else if (typeof opt.legacyDefault === 'function') untouched = !!opt.legacyDefault(cur);
    else untouched = opt.legacyDefault !== undefined && same(cur, opt.legacyDefault);
    if (untouched) {
      if (same(cur, want.value) && rec && rec.from === want.from) { Object.assign(rec, meta); res.action = 'same'; return res; }
      mark(o, path, want.value, want.from, meta); res.action = same(cur, want.value) ? 'same' : 'set'; return res;
    }
    // 사용자가 고친 값 — 지킴. 저장소 값이 예전에 기록한 값과 다르면 충돌 (원본이 바뀌었는데 사용자 값이 있음)
    res.action = rec && !same(rec.v, want.value) && !same(cur, want.value) ? 'conflict' : 'keep-user';
    // 기록 v 는 그대로 (또는 "사용자 값" 표시) → status() = 'user'. 새 원본 값은 pending 에 (출처 상자의 "원본 값으로 되돌리기")
    if (!rec) { o.src = o.src || { fields: {} }; o.src.fields = o.src.fields || {}; o.src.fields[path] = Object.assign({ from: want.from, v: { __userKept: true }, pending: clone(want.value) }, meta); }
    else rec.pending = clone(want.value);
    return res;
  }
  /** 원본 값으로 되돌리기 (pending 이 있으면 그 값) */
  function revert(o, path) {
    const rec = o && o.src && o.src.fields && o.src.fields[path]; if (!rec) return false;
    const v = rec.pending !== undefined ? rec.pending : rec.v; if (v && v.__userKept) return false;
    setPath(o, path, clone(v)); rec.v = clone(v); delete rec.pending; delete rec.userKept; return true;
  }
  /** 프로파일 붙이기 (저장소를 바꾸면 새 프로파일로) */
  function stamp(o, profile) {
    o.src = o.src || { fields: {} };
    if (profile) { if (o.src.profile && o.src.profile !== profile.id) o.src.prevProfile = o.src.profile; o.src.profile = profile.id; o.src.repo = profile.label || o.src.repo || ''; }
    o.src.at = new Date().toISOString();
  }
  /** 화면 표시용: 칸 출처 이름 */
  const LABEL = { repo: '저장소 원본', derived: '저장소에서 추론', default: 'PDMaker 기본값', user: '사용자 편집', unknown: '출처 기록 없음' };
  /** 리소스의 출처 요약 [{ path, status, label, file, line, key, note, pending }] */
  function summary(o) {
    const F = (o && o.src && o.src.fields) || {};
    return Object.keys(F).map(p => { const s = status(o, p), f = F[p]; return { path: p, status: s, label: LABEL[s], file: f.file || '', line: f.line || 0, key: f.key || '', note: f.note || '', pending: f.pending !== undefined ? f.pending : undefined, conflict: s === 'user' && f.pending !== undefined && !same(f.pending, getPath(o, p)) }; });
  }
  return { status, mark, sync, revert, stamp, summary, LABEL, getPath, setPath, same };
})();

// ---------------- 출처 상자 (영웅 · 캐릭터 편집기) ----------------
/** key = 'hero:<id>' | 'char:<id>'. 출처 기록이 없으면 null */
PDM.provBox = function (key) {
  const h = PDM.h, o = PDM.store && PDM.store.get(key); if (!o) return null;
  const S = PDM.prov.summary(o), cl = o.classify;
  if (!S.length && !cl) return null;
  const R = PDM.REPO_ANALYSIS, curProf = R && R.profile, other = o.src && o.src.profile && curProf && o.src.profile !== curProf.id;
  const CLS = { repo: 'good', derived: 'info', default: '', user: 'warn', unknown: '' };
  const CAT = { boss: '보스', elite: '엘리트 · 미니보스', mob: '일반 몬스터', npc: 'NPC', review: '분류 확인 필요' };
  const short = v => { const t = typeof v === 'string' ? v : JSON.stringify(v); return t === undefined ? '(없음)' : t.length > 48 ? t.slice(0, 45) + '…' : t; };
  const rows = S.map(s => h('div', { class: 'ra-row', title: [s.key && '글자 키: ' + s.key, s.file && '원본: ' + s.file + (s.line ? ':' + s.line : ''), s.note].filter(Boolean).join('\n') },
    h('span', { class: 'badge ' + (CLS[s.status] || '') }, s.label), h('span', { class: 'mono' }, s.path),
    h('span', { class: 'ra-note truncate grow' }, [s.key ? s.key : '', s.file ? s.file.split('/').pop() + (s.line ? ':' + s.line : '') : '', s.note].filter(Boolean).join(' · ')),
    s.pending !== undefined && s.status === 'user' ? h('button', { class: 'btn xs', title: '저장소의 지금 값: ' + short(s.pending), onclick: () => PDM.store.edit(key, '원본 값으로 되돌리기', r => { PDM.prov.revert(r, s.path); }) }, s.conflict ? '⚠ 원본이 바뀜 — 원본 값으로' : '원본 값으로') : null));
  const box = h('details', { class: 'ra-grp prov-box', open: S.some(s => s.conflict) || (cl && cl.auto === 'review' && !(o.src && o.src.fields && o.src.fields.kind && PDM.prov.status(o, 'kind') === 'user')) },
    h('summary', { class: 'pointer' }, h('b', {}, '데이터 출처'), ' ',
      h('span', { class: 'ra-note' }, `저장소 원본 ${S.filter(s => s.status === 'repo').length} · 추론 ${S.filter(s => s.status === 'derived').length} · 사용자 편집 ${S.filter(s => s.status === 'user').length}` + (S.some(s => s.conflict) ? ` · ⚠ 충돌 ${S.filter(s => s.conflict).length}` : '') + (o.src && o.src.repo ? ` — ${o.src.repo}` : ''))),
    other ? h('div', { class: 'c-warn my-1' }, `⚠ 이 값들은 다른 게임 저장소(프로파일 ${o.src.profile}${o.src.repo ? ' · ' + o.src.repo : ''})에서 가져왔습니다. 지금 저장소는 「${curProf.label}」 — 프로젝트 설정 › "영웅·캐릭터를 저장소에 맞추기"로 다시 맞출 수 있습니다.`) : null,
    cl ? h('div', { class: 'my-1' }, h('b', {}, '분류: '), `자동 = ${CAT[cl.auto] || cl.auto}` + (cl.confidence ? ` (신뢰도 ${({ high: '높음', medium: '중간', low: '낮음', none: '근거 없음' })[cl.confidence] || cl.confidence})` : '') + (PDM.prov.status(o, 'kind') === 'user' ? ` · 사용자 지정 = ${PDM.CHAR_KINDS[o.kind] || o.kind} (다시 분석해도 유지)` : ''),
      cl.summonOf ? h('div', { class: 'ra-note' }, '소환한 쪽: ' + cl.summonOf) : null,
      ...(cl.evidence || []).map(e => h('div', { class: 'ra-note mono' }, `· ${e.kind} → ${CAT[e.to] || e.to} (가중치 ${e.weight}) ${e.where || ''}`)),
      !(cl.evidence || []).length ? h('div', { class: 'ra-note' }, '보스 · 엘리트 근거가 없어 일반 몬스터로 봄') : null,
      h('div', { class: 'ra-note' }, '분류를 바꾸려면 아래 "종류"를 고르세요 — 사용자 지정은 다시 분석 · 맞추기에서 바뀌지 않습니다.')) : null,
    ...rows);
  return box;
};
