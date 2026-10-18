// ================================================================
//  스크린 · 카메라 연출 계산 (6차) — 런타임 MakerCamera 와 같은 식 (tools/tests/run.js 가 두 쪽을 비교)
//    좌표: 월드 = 게임 픽셀 (칸 하나 16, 칸 (x, y) 의 가운데 = (x*16+8, y*16+8)) · 카메라는 "가운데"로 다룸
//    이벤트 미리보기(editors/event.js)가 시간 · 흔들림 모양을 이 식으로 보여 줌 — 편집기 맵 데이터는 바꾸지 않음
// ================================================================
PDM.camera = (function () {
  const TILE = 16;
  /** 보간 (MakerCamera.ease) */
  const ease = (name, k) => name === 'linear' ? k : name === 'in' ? k * k : name === 'out' ? 1 - (1 - k) * (1 - k) : k * k * (3 - 2 * k);
  /** 목표 가운데를 맵 안으로 (MakerCamera.clampAxis): 맵이 화면보다 크면 화면이 맵 밖을 보지 않게, 작으면 맵 가운데 */
  function clampAxis(v, view, map) {
    if (!Number.isFinite(v)) v = map / 2;
    if (map <= view) return map / 2;
    return Math.max(view / 2, Math.min(map - view / 2, v));
  }
  /** 잘못된 시간 = 0 (바로) · 최대 60초 (MakerCamera.safeTime) */
  const safeTime = s => !Number.isFinite(s) || s <= 0 ? 0 : Math.min(60, s);
  /** 흔들림 오프셋 (게임 픽셀) — t 초 지남 (MakerCamera.before 의 흔들림 부분). 끝나면 정확히 0 */
  function shakeOffset(power, dur, freq, decay, axis, t) {
    if (!(dur > 0) || t >= dur || !(power > 0)) return { x: 0, y: 0 };
    const k = t / dur, d = decay === 'none' ? 1 : decay === 'smooth' ? (1 - k) * (1 - k) : 1 - k;
    const w = Math.PI * 2 * freq * t, amp = power * d;
    return { x: axis === 'y' ? 0 : amp * (0.7 * Math.sin(w) + 0.3 * Math.sin(w * 2.3 + 1.1)), y: axis === 'x' ? 0 : amp * (0.7 * Math.sin(w * 1.13 + 2.0) + 0.3 * Math.cos(w * 1.7)) };
  }
  /** 명령 값 → 런타임이 쓰는 값 (단위 · 범위 보정) */
  function params(c) {
    const sec = safeTime((+c.time || 0) / 10);
    switch (c.cmd) {
      case 'camShake': return { power: Math.max(0, Math.min(64, Number.isFinite(+c.power) ? +c.power : 4)), sec: sec <= 0 ? 0.5 : sec, freq: Math.max(1, Math.min(60, Number.isFinite(+c.freq) ? +c.freq : 12)), decay: c.decay || 'linear', axis: c.axis || 'both', wait: c.wait !== false };
      case 'camReset': return { sec: c.mode === 'instant' ? 0 : (sec <= 0 ? 0.5 : sec), follow: c.follow !== false, wait: c.wait !== false };
      case 'camMove': return { sec, ease: c.ease || 'smooth', wait: c.wait !== false };
      default: return {};
    }
  }
  /** 타일 → 월드 (칸 가운데) */
  const tileToWorld = (x, y) => ({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
  return { TILE, ease, clampAxis, safeTime, shakeOffset, params, tileToWorld };
})();
