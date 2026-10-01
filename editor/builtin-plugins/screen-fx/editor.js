// 화면 효과 플러그인 — 에디터 쪽
// 이 파일은 function(api){ ... } 본문으로 실행됩니다. api 에 쓸 수 있는 것은 plugin-api.js 의 makeApi() 참고.
const { h } = api;

// 1) 이벤트 명령: plugin.json 의 contributes 로도 되지만, 요약 문구를 예쁘게 하려고 직접 등록
api.registerEventCommand('fx.weather', {
  name: '날씨',
  params: [
    { k: 'kind', t: 'select', label: '종류', options: { none: '없음', rain: '비', snow: '눈', firefly: '반딧불' } },
    { k: 'power', t: 'number', label: '세기(1~10)' }],
  sum: c => `날씨: ${({ none: '없음', rain: '비', snow: '눈', firefly: '반딧불' })[c.kind || 'none']} ${c.power || ''}`
});

// 2) 편집기: 파티클 미리보기 (이펙트 메이커의 뼈대)
function preview(kind, power) {
  const cv = h('canvas', { width: 480, height: 270, style: { background: '#0b0a10', borderRadius: '6px', border: '1px solid var(--line)' } });
  const g = cv.getContext('2d');
  const n = (power || 5) * 20, ps = [];
  for (let i = 0; i < n; i++) ps.push({ x: Math.random() * 480, y: Math.random() * 270, v: 1 + Math.random() * 3, p: Math.random() * 6 });
  let alive = true;
  (function loop() {
    if (!alive || !cv.isConnected && ps.t > 5) return;
    ps.t = (ps.t || 0) + 1;
    g.fillStyle = 'rgba(11,10,16,.35)'; g.fillRect(0, 0, 480, 270);
    ps.forEach(p => {
      if (kind === 'rain') { g.strokeStyle = '#7fb3ff'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - 2, p.y + 8); g.stroke(); p.y += p.v * 4; p.x -= 0.8; }
      else if (kind === 'snow') { g.fillStyle = '#fff'; g.fillRect(p.x, p.y, 2, 2); p.y += p.v * 0.6; p.x += Math.sin((p.y + p.p * 40) / 30) * 0.6; }
      else { p.p += 0.05; g.fillStyle = `rgba(230,255,120,${0.4 + 0.6 * Math.abs(Math.sin(p.p))})`; g.fillRect(p.x, p.y, 2, 2); p.x += Math.cos(p.p) * 0.5; p.y += Math.sin(p.p * 0.7) * 0.5; }
      if (p.y > 270) { p.y = -10; p.x = Math.random() * 500; } if (p.x < -10) p.x = 490; if (p.x > 490) p.x = -10;
    });
    requestAnimationFrame(loop);
  })();
  cv.stop = () => { alive = false; };
  return cv;
}
api.registerEditor({
  id: 'fx-preview', icon: '✨', title: () => '효과 미리보기',
  match: k => k === 'fx-preview',
  tree: () => api.store.isOpen ? [{ id: 'fx', label: '화면 효과 (플러그인)', icon: '✨', open: 'fx-preview', order: 70 }] : [],
  render(key, ctx) {
    const st = ctx.st = ctx.st || { kind: 'rain', power: 5 };
    const cv = preview(st.kind, st.power);
    ctx.onDispose(() => cv.stop());
    const sel = h('select', { onchange: () => { st.kind = sel.value; ctx.refresh(); } }, ['rain', 'snow', 'firefly'].map(k => h('option', { value: k, selected: st.kind === k }, k)));
    const pw = h('input', { type: 'range', min: 1, max: 10, value: st.power, onchange: () => { st.power = +pw.value; ctx.refresh(); } });
    return h('div', { class: 'page' }, h('h1', {}, '효과 미리보기'),
      h('p', { class: 'lead' }, '예제 플러그인이 추가한 편집기입니다. 이벤트 명령 「날씨」로 게임에서 같은 효과를 켭니다 (게임 쪽은 runtime jar 가 처리).'),
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' } }, '종류', sel, '세기', pw), cv);
  }
});
api.registerMenu('플러그인', '효과 미리보기 열기', () => api.openTab('fx-preview'));
api.log('화면 효과 플러그인 준비 완료');
