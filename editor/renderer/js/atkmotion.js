// ================================================================
//  아이템 공격 모션 · 이펙트 타임라인 규칙 (8차) — 편집기(타임라인 · 미리보기)와 런타임(MakerAtkMotion.java · MakerSwing)이 같은 규칙
//    데이터 attackFx (프로젝트 아이템 items/<id>.json · 게임 무기 gameitems.json items["spd:…"]) — 예전 형식(1판) 그대로 읽음
//      1판: keys [[t, 각도, 거리, 크기, 불투명도]] (구간마다 smoothstep) · hits [t] · dur(초) · speed · dist · scale · behind · trail · trailEvery · hit · hitAt · sound
//      2판(더함): tracks { angle|dist|scale|alpha|ox|oy: [[t, 값, 이징]] } — 있으면 keys 대신 · 속성마다 따로 키프레임
//                 segments { windup, hit, recovery } (0~1 표시 구간 — 시작 · 준비 · 타격 · 회복) · hitWindows [[t0, t1]] (판정이 켜진 구간 — 여러 번)
//                 sync: 'game' (게임 공격 동작이 끝날 때 판정 — 원작) | 'hit' (첫 타격 시각에 판정 — 게임 공격 동작 길이를 그 시각에 맞춤)
//                 events [{ id, type, t, dur, anchor, dir, size, alpha, ease, ref, every, power, color, role }] — 같은 타임라인의 이펙트
//    시간 t 는 0~1 (모션 한 번), 실제 초 = t × 길이 (길이 = dur ÷ speed — 게임과 같은 Game.elapsed 초). 프레임 = 초 × 60 (반올림, 화면 60fps 기준 표시용)
//    이징 (키프레임에서 다음 키프레임까지): smooth(1판과 같음) · linear · in · out · inout · step(다음 키까지 그대로) · back(살짝 넘침)
//    ox · oy = 바라보는 쪽 기준 앞(+ox) · 옆(+oy = 시계 방향 쪽) 오프셋 px — 왼쪽을 보면 옆이 뒤집힘
//    순수 함수 — tools/tests/run.js 가 런타임 MakerAtkMotion 을 실제로 실행해 같은 결과인지 비교
// ================================================================
(function () {
  const EASES = ['smooth', 'linear', 'in', 'out', 'inout', 'step', 'back'];
  const PROPS = ['angle', 'dist', 'scale', 'alpha', 'ox', 'oy'];
  const DEF = { angle: 0, dist: 0, scale: 1, alpha: 1, ox: 0, oy: 0 };
  const TYPES = ['effect', 'flash', 'shake', 'sound', 'trail', 'shock', 'image', 'projectile'];
  const ANCHORS = ['tip', 'hero', 'target'];
  const FPS = 60;
  /** 게임 영웅 공격 동작 길이 (HeroSprite attack: 4칸 · 15fps → 4 × 1/15 초 — MovieClip 이 마지막 칸 뒤 한 칸 시간이 더 지나야 끝남) */
  const HERO_ATTACK_SEC = 4 / 15;

  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const fin = v => typeof v === 'number' && Number.isFinite(v);
  const num = (o, k, d) => { const v = isObj(o) ? o[k] : undefined; if (fin(v)) return v; if (typeof v === 'string' && v.trim() !== '') { const n = Number(v.trim()); return Number.isFinite(n) ? n : d; } return d; };
  const str = (o, k, d) => { const v = isObj(o) ? o[k] : undefined; return typeof v === 'string' ? v : d; };
  const bool = (o, k, d) => { const v = isObj(o) ? o[k] : undefined; return typeof v === 'boolean' ? v : d; };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pick = (o, k, list, d) => { const v = str(o, k, d); return list.includes(v) ? v : d; };

  function ease(name, u) {
    u = clamp(u, 0, 1);
    switch (name) {
      case 'linear': return u;
      case 'in': return u * u;
      case 'out': return 1 - (1 - u) * (1 - u);
      case 'inout': return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      case 'step': return u < 1 ? 0 : 1;
      case 'back': { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); }
      default: return u * u * (3 - 2 * u);
    }
  }
  /** 한 트랙: [[t, 값, 이징]] → t 순서로 정리 (숫자가 아닌 것 · 0~1 밖 시각은 버림) */
  function normTrack(a) {
    if (!Array.isArray(a)) return [];
    const out = [];
    for (const k of a) {
      if (!Array.isArray(k) || k.length < 2 || !fin(k[0]) || !fin(k[1]) || k[0] < 0 || k[0] > 1) continue;
      out.push([k[0], k[1], EASES.includes(k[2]) ? k[2] : 'smooth']);
    }
    out.sort((x, y) => x[0] - y[0]);
    return out;
  }
  /** 트랙들 (2판 tracks, 없으면 1판 keys 를 속성마다 smooth 트랙으로 — 1판과 결과가 같음) */
  function tracksOf(fx) {
    const t = isObj(fx) && isObj(fx.tracks) ? fx.tracks : null, out = {};
    if (t) { for (const p of PROPS) out[p] = normTrack(t[p]); return out; }
    const keys = isObj(fx) && Array.isArray(fx.keys) ? fx.keys.filter(k => Array.isArray(k) && k.length >= 5 && k.slice(0, 5).every(fin)) : [];
    PROPS.forEach((p, i) => { out[p] = i < 4 ? keys.map(k => [k[0], k[i + 1], 'smooth']) : []; });
    return out;
  }
  /** 트랙 하나의 t 값 (키가 없으면 기본값) */
  function sampleTrack(tr, t, d) {
    if (!tr.length) return d;
    if (t <= tr[0][0]) return tr[0][1];
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      if (t <= b[0]) { const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]); return a[1] + (b[1] - a[1]) * ease(a[2], u); }
    }
    return tr[tr.length - 1][1];
  }
  /** t(0~1) 에서 { angle, dist, scale, alpha, ox, oy } (트랙을 미리 만들었으면 tracks 를 넘겨 반복 계산을 줄임) */
  function sample(fx, t, tracks) {
    const T = tracks || tracksOf(fx), o = {};
    for (const p of PROPS) o[p] = sampleTrack(T[p], t, DEF[p]);
    return o;
  }
  /** 한 번의 길이 (초) — 런타임 MakerSwing 과 같음 */
  const durOf = fx => Math.max(0.05, num(fx, 'dur', 0.3) / Math.max(0.1, num(fx, 'speed', 1)));
  /** 타격 시각들 (0~1, 정렬) */
  const hitsOf = fx => (isObj(fx) && Array.isArray(fx.hits) ? fx.hits.filter(h => fin(h) && h >= 0 && h <= 1) : []).slice().sort((a, b) => a - b);
  /** 판정 구간 [[t0, t1]] — hitWindows 가 없으면 타격 시각마다 [h, h] */
  function windowsOf(fx) {
    const w = isObj(fx) && Array.isArray(fx.hitWindows) ? fx.hitWindows.filter(x => Array.isArray(x) && x.length >= 2 && fin(x[0]) && fin(x[1])).map(x => [clamp(Math.min(x[0], x[1]), 0, 1), clamp(Math.max(x[0], x[1]), 0, 1)]) : null;
    return w && w.length ? w.sort((a, b) => a[0] - b[0]) : hitsOf(fx).map(h => [h, h]);
  }
  /** 이펙트 하나 정리 */
  function normEvent(e) {
    return { id: str(e, 'id', ''), type: pick(e, 'type', TYPES, 'effect'), t: clamp(num(e, 't', 0), 0, 1), dur: clamp(num(e, 'dur', 0), 0, 10),
      anchor: pick(e, 'anchor', ANCHORS, 'tip'), dir: num(e, 'dir', 0), size: clamp(num(e, 'size', 1), 0, 20), alpha: clamp(num(e, 'alpha', 1), 0, 1),
      ease: pick(e, 'ease', EASES, 'linear'), ref: str(e, 'ref', ''), every: clamp(num(e, 'every', 0.03), 0.01, 1), power: clamp(num(e, 'power', 3), 0, 64),
      color: str(e, 'color', '#ffffff'), grow: clamp(num(e, 'grow', 0), -1, 10), role: pick(e, 'role', ['', 'hit'], '') };
  }
  const eventsOf = fx => (isObj(fx) && Array.isArray(fx.events) ? fx.events.filter(isObj).map(normEvent) : []);
  /** 이펙트의 sec 초 때 상태: 시작 전 · 진행 중(u 0~1, 이징 p) · 끝. 이미지 = 불투명도 alpha × (1 − p) · 크기 size × (1 + grow × p) */
  function eventState(ev, D, sec) {
    const s = ev.t * D, e = s + ev.dur;
    if (sec < s) return { phase: 'before', u: 0, p: 0, alpha: ev.alpha, size: ev.size };
    if (ev.dur <= 0) return { phase: 'fire', u: 1, p: 1, alpha: ev.alpha, size: ev.size };
    if (sec > e) return { phase: 'after', u: 1, p: 1, alpha: 0, size: ev.size * (1 + ev.grow) };
    const u = (sec - s) / ev.dur, p = ease(ev.ease, u);
    return { phase: 'active', u, p, alpha: ev.alpha * (1 - p), size: ev.size * (1 + ev.grow * p) };
  }
  /** 판정 시각 (초): sync 'hit' = 첫 타격 · 'game' = 게임 영웅 공격 동작이 끝날 때 (animSec) */
  function judgeSec(fx, animSec) {
    const D = durOf(fx), h = hitsOf(fx);
    return str(fx, 'sync', 'game') === 'hit' && h.length ? h[0] * D : (fin(animSec) ? animSec : HERO_ATTACK_SEC);
  }
  /** 게임 공격 동작(기본 영웅 4칸)을 sync 'hit' 일 때 맞출 한 칸 시간 (초) — 런타임이 그 공격에만 씀 */
  function syncDelay(fx, frames) { const h = hitsOf(fx); return str(fx, 'sync', 'game') === 'hit' && h.length ? Math.max(0.01, h[0] * durOf(fx)) / Math.max(1, frames || 4) : -1; }
  const frameOf = sec => Math.round(sec * FPS);

  // ------------------------------------------------------------ 검사 → [{ level, code, path, msg }]
  function validate(fx, animSec) {
    const out = [], add = (level, code, path, msg) => out.push({ level, code, path, msg });
    if (!isObj(fx)) return out;
    const D = durOf(fx), T = tracksOf(fx);
    if (isObj(fx.tracks)) {
      for (const p of PROPS) {
        const raw = fx.tracks[p];
        if (raw != null && !Array.isArray(raw)) add('error', 'track', `tracks.${p}`, `트랙 ${p} 가 목록이 아닙니다`);
        if (Array.isArray(raw) && raw.some(k => !Array.isArray(k) || !fin(k[0]) || !fin(k[1]) || k[0] < 0 || k[0] > 1)) add('warn', 'keyRange', `tracks.${p}`, `트랙 ${p}: 0~1 밖이거나 숫자가 아닌 키프레임은 무시합니다`);
      }
      if (!PROPS.some(p => T[p].length)) add('error', 'noKeys', 'tracks', '키프레임이 하나도 없습니다');
    } else if (!Array.isArray(fx.keys) || fx.keys.length < 2) add('error', 'noKeys', 'keys', '키프레임이 2개 이상 있어야 합니다');
    if (num(fx, 'dur', 0.3) <= 0) add('error', 'negative', 'dur', '길이는 0보다 커야 합니다');
    if (num(fx, 'speed', 1) <= 0) add('error', 'negative', 'speed', '빠르기는 0보다 커야 합니다');
    const hits = hitsOf(fx), wins = windowsOf(fx), sync = str(fx, 'sync', 'game');
    if (Array.isArray(fx.hits) && fx.hits.some(h => !fin(h) || h < 0 || h > 1)) add('warn', 'hitRange', 'hits', '0~1 밖의 타격 시각은 무시합니다');
    if (Array.isArray(fx.hitWindows) && fx.hitWindows.some(w => !Array.isArray(w) || w.length < 2 || !fin(w[0]) || !fin(w[1]))) add('warn', 'windowRange', 'hitWindows', '잘못된 판정 구간은 무시합니다');
    if (!hits.length && !wins.length) add('warn', 'noHit', 'hits', '타격 시각이 없습니다 — 게임 판정은 공격 동작이 끝날 때 한 번 (모션과 맞추려면 타격 시각을 넣으세요)');
    const evs = eventsOf(fx), jt = judgeSec(fx, animSec) / D;
    if (hits.length > 1) add('warn', 'multiHitVisual', 'hits', `타격이 ${hits.length}번이지만 게임 판정은 공격 한 번에 한 번입니다 — 나머지는 그림 · 이펙트만`);
    // 그림(맞는 이펙트)은 나오는데 그 시각에 판정이 없음
    evs.forEach((e, i) => {
      if (e.role !== 'hit') return;
      const inWin = wins.some(w => e.t >= w[0] - 1e-6 && e.t <= w[1] + 1e-6);
      if (!inWin) add('warn', 'visualNoJudge', `events.${i}`, `이펙트 ${e.id || i + 1}(맞는 순간)가 판정 구간 밖(${(e.t * D).toFixed(2)}초)에 나옵니다 — 그림만 보이고 판정이 없습니다`);
    });
    if (sync === 'game' && hits.length && Math.abs(hits[0] - jt) * D > 0.06) add('warn', 'desync', 'sync', `첫 타격(${(hits[0] * D).toFixed(2)}초)과 게임 판정(${(jt * D).toFixed(2)}초 — 공격 동작이 끝날 때)이 어긋납니다. "판정 맞추기: 첫 타격"을 고르면 같아집니다`);
    if (sync === 'hit' && !hits.length) add('warn', 'syncNoHit', 'sync', '판정을 첫 타격에 맞추려면 타격 시각이 있어야 합니다 — 지금은 원작대로');
    if (jt > 1 + 1e-6) add('warn', 'judgeAfterEnd', 'dur', `게임 판정(${(jt * D).toFixed(2)}초)이 모션이 끝난 뒤(${D.toFixed(2)}초)입니다 — 그림이 사라진 뒤에 맞습니다`);
    evs.forEach((e, i) => {
      if ((e.type === 'effect' || e.type === 'trail' || e.type === 'image' || e.type === 'sound') && !e.ref) add('warn', 'noRef', `events.${i}.ref`, `이펙트 ${e.id || i + 1}: ${e.type === 'sound' ? '소리' : e.type === 'image' ? '그림' : '이펙트'}를 고르세요 (지금은 아무것도 나오지 않음)`);
      if (e.t * D + e.dur > D + 2) add('warn', 'eventLong', `events.${i}.dur`, `이펙트 ${e.id || i + 1}: 모션이 끝나고도 오래 남습니다`);
    });
    return out;
  }

  PDM.atkMotion = { EASES, PROPS, DEF, TYPES, ANCHORS, FPS, HERO_ATTACK_SEC, ease, normTrack, tracksOf, sampleTrack, sample, durOf, hitsOf, windowsOf, normEvent, eventsOf, eventState, judgeSec, syncDelay, frameOf, validate };
})();
